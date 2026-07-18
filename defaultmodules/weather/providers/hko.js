const Log = require("logger");
const HTTPFetcher = require("#http_fetcher");

const HKO_API_BASE = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php";
const ERROR_TRANSLATION_KEY = "MODULE_ERROR_UNSPECIFIED";

/**
 * Map HKO weather icon numbers to weather-icons class names.
 * @see https://www.hko.gov.hk/textonly/v2/explain/wxicon_e.htm
 */
const WEATHER_ICON_MAP = {
	50: "day-sunny",
	51: "day-cloudy",
	52: "day-cloudy",
	53: "day-showers",
	54: "day-showers",
	60: "cloudy",
	61: "cloudy",
	62: "rain",
	63: "rain",
	64: "rain",
	65: "thunderstorm",
	70: "night-clear",
	71: "night-clear",
	72: "night-clear",
	73: "night-clear",
	74: "night-clear",
	75: "night-clear",
	76: "night-alt-cloudy",
	77: "night-clear",
	80: "strong-wind",
	81: "day-sunny",
	82: "humidity",
	83: "fog",
	84: "fog",
	85: "dust",
	90: "hot",
	91: "day-sunny",
	92: "cloudy",
	93: "snowflake-cold"
};

/**
 * Map HKO PSR (probability of significant rain) labels to approximate %.
 */
const PSR_PROBABILITY = {
	高: 80,
	中高: 65,
	中: 50,
	中低: 35,
	低: 20,
	High: 80,
	"Medium High": 65,
	Medium: 50,
	"Medium Low": 35,
	Low: 20
};

/**
 * Server-side weather provider for Hong Kong Observatory Open Data API.
 * No API key required.
 * @see https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation.pdf
 */
class HKOProvider {
	constructor (config) {
		this.config = {
			apiBase: HKO_API_BASE,
			// Observation station place name, e.g. "元朗公園" / "Yuen Long Park"
			station: "元朗公園",
			lang: null,
			type: "current",
			maxNumberOfDays: 5,
			maxEntries: 5,
			updateInterval: 10 * 60 * 1000,
			...config
		};

		this.locationName = null;
		this.fetcher = null;
		this.onDataCallback = null;
		this.onErrorCallback = null;
	}

	initialize () {
		if (this.config.type === "current") {
			this.locationName = this.config.station || (this.#lang() === "en" ? "Hong Kong" : "香港");
		} else {
			this.locationName = this.#lang() === "en" ? "Hong Kong" : "香港";
		}
		this.#initializeFetcher();
	}

	setCallbacks (onData, onError) {
		this.onDataCallback = onData;
		this.onErrorCallback = onError;
	}

	start () {
		if (this.fetcher) {
			this.fetcher.startPeriodicFetch();
		}
	}

	stop () {
		if (this.fetcher) {
			this.fetcher.clearTimer();
		}
	}

	#initializeFetcher () {
		this.fetcher = new HTTPFetcher(this.#getUrl(), {
			reloadInterval: this.config.updateInterval,
			headers: { "Cache-Control": "no-cache" },
			logContext: "weatherprovider.hko"
		});

		this.fetcher.on("response", async (response) => {
			if (response.status === 304) return;
			try {
				const data = await response.json();
				this.#handleResponse(data);
			} catch (error) {
				Log.error("[hko] Failed to parse JSON:", error);
				this.#sendError("Failed to parse API response");
			}
		});

		this.fetcher.on("error", (errorInfo) => {
			if (this.onErrorCallback) {
				this.onErrorCallback(errorInfo);
			}
		});
	}

	#handleResponse (data) {
		try {
			let weatherData;

			switch (this.config.type) {
				case "current":
					weatherData = this.#generateCurrentWeather(data);
					break;
				case "forecast":
				case "daily":
					weatherData = this.#generateForecast(data);
					break;
				case "hourly":
					throw new Error("HKO provider does not support hourly forecasts");
				default:
					throw new Error(`Unknown weather type: ${this.config.type}`);
			}

			if (this.onDataCallback && weatherData) {
				this.onDataCallback(weatherData);
			}
		} catch (error) {
			Log.error("[hko] Error processing weather data:", error);
			this.#sendError(error.message);
		}
	}

	#generateCurrentWeather (data) {
		if (!data?.temperature?.data?.length) {
			throw new Error("Invalid HKO current weather response");
		}

		const station = this.#findStation(data.temperature.data);
		this.locationName = station.place;

		const weather = {
			date: this.#parseDate(data.updateTime) || new Date(),
			temperature: this.#parseNumber(station.value),
			weatherType: this.#convertWeatherType(data.icon?.[0])
		};

		const humidity = this.#findStation(data.humidity?.data || [], true);
		if (humidity) {
			weather.humidity = this.#parseNumber(humidity.value);
		}

		const rainfall = this.#findStation(data.rainfall?.data || [], true);
		if (rainfall && rainfall.max !== undefined && rainfall.max !== "") {
			const amount = this.#parseNumber(rainfall.max);
			if (amount !== null) {
				weather.precipitationAmount = amount;
				weather.precipitationUnits = rainfall.unit || "mm";
			}
		}

		const uv = data.uvindex?.data?.[0]?.value;
		if (uv !== undefined && uv !== "") {
			weather.uvIndex = this.#parseNumber(uv);
		}

		return weather;
	}

	#generateForecast (data) {
		const days = data?.weatherForecast;
		if (!Array.isArray(days) || days.length === 0) {
			throw new Error("Invalid HKO forecast response");
		}

		this.locationName = this.#lang() === "en" ? "Hong Kong" : "香港";

		const limit = Math.max(1, this.config.maxNumberOfDays || this.config.maxEntries || 5);

		return days.slice(0, limit).map((day) => {
			const weather = {
				date: this.#parseForecastDate(day.forecastDate),
				maxTemperature: this.#parseNumber(day.forecastMaxtemp?.value),
				minTemperature: this.#parseNumber(day.forecastMintemp?.value),
				weatherType: this.#convertWeatherType(day.ForecastIcon)
			};

			const maxRh = this.#parseNumber(day.forecastMaxrh?.value);
			const minRh = this.#parseNumber(day.forecastMinrh?.value);
			if (maxRh !== null && minRh !== null) {
				weather.humidity = Math.round((maxRh + minRh) / 2);
			} else if (maxRh !== null) {
				weather.humidity = maxRh;
			}

			const pop = this.#psrToProbability(day.PSR);
			if (pop !== null) {
				weather.precipitationProbability = pop;
			}

			return weather;
		});
	}

	/**
	 * Find temperature/rainfall station entry by configured name.
	 * Falls back to 香港天文台 / Hong Kong Observatory, then first entry.
	 * @param {Array} list Station data array
	 * @param {boolean} optional If true, return null when list empty
	 * @returns {object|null}
	 */
	#findStation (list, optional = false) {
		if (!Array.isArray(list) || list.length === 0) {
			if (optional) return null;
			throw new Error("No station data in HKO response");
		}

		const wanted = `${this.config.station || ""}`.trim().toLowerCase();
		if (wanted) {
			const match = list.find((item) => `${item.place || ""}`.toLowerCase() === wanted)
				|| list.find((item) => `${item.place || ""}`.toLowerCase().includes(wanted));
			if (match) return match;
		}

		const fallbacks = ["元朗公園", "yuen long park", "香港天文台", "hong kong observatory"];
		for (const name of fallbacks) {
			const match = list.find((item) => `${item.place || ""}`.toLowerCase() === name);
			if (match) return match;
		}

		return list[0];
	}

	#getUrl () {
		const params = new URLSearchParams({
			dataType: this.config.type === "current" ? "rhrread" : "fnd",
			lang: this.#lang()
		});
		return `${this.config.apiBase}?${params}`;
	}

	#lang () {
		const candidates = [this.config.apiLang, this.config.lang, this.config.language];
		for (const value of candidates) {
			if (!value) continue;
			const normalized = `${value}`.toLowerCase();
			if (normalized === "tc" || normalized === "sc" || normalized === "en") return normalized;
			if (normalized.startsWith("zh-tw") || normalized === "zh-hk" || normalized === "zh-hant") return "tc";
			if (normalized.startsWith("zh")) return "sc";
			if (normalized.startsWith("en")) return "en";
		}
		return "tc";
	}

	#psrToProbability (psr) {
		if (!psr) return null;
		const key = `${psr}`.trim();
		return Object.prototype.hasOwnProperty.call(PSR_PROBABILITY, key) ? PSR_PROBABILITY[key] : null;
	}

	#convertWeatherType (icon) {
		if (icon === undefined || icon === null || icon === "") return null;
		return WEATHER_ICON_MAP[Number(icon)] || null;
	}

	#parseForecastDate (value) {
		// YYYYMMDD in HKT
		const text = `${value || ""}`;
		if (!/^\d{8}$/.test(text)) return null;
		const date = new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T12:00:00+08:00`);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	#parseDate (value) {
		if (!value) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	#parseNumber (value) {
		const number = parseFloat(value);
		return Number.isFinite(number) ? number : null;
	}

	#sendError (message) {
		if (this.onErrorCallback) {
			this.onErrorCallback({
				message,
				translationKey: ERROR_TRANSLATION_KEY
			});
		}
	}
}

module.exports = HKOProvider;
