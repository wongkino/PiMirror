/* Config — Waveshare landscape strip 1480×320
 *
 * Pages: 此刻 / 鏡頭 / 影集 — 控制按鈕已併入此刻頁最右欄。
 */

const haUrl = (() => {
	try {
		return new URL((process.env.HA_URL || "http://10.0.0.2:8123").replace(/\/$/, ""));
	} catch {
		return new URL("http://10.0.0.2:8123");
	}
})();
const haHost = `${haUrl.protocol}//${haUrl.hostname}`;
const haPort = Number(haUrl.port || (haUrl.protocol === "https:" ? 443 : 80));

const {
	HOLIDAYS_NAME,
	buildPersonalCalendars,
	personalCalendarHeader
} = require(`${global.root_path}/config/calendarEnv.js`);
const personalCalendars = buildPersonalCalendars();

/** 運輸署特別交通消息路段關鍵字（env 逗號分隔；未設＝預設三路；空字串＝不過濾） */
const tdTrafficKeywords =
	process.env.TD_TRAFFIC_LOCATIONS === undefined
		? ["元朗公路", "大欖隧道", "屯門公路"]
		: String(process.env.TD_TRAFFIC_LOCATIONS)
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);

let config = {
	address: "0.0.0.0",
	port: 8080,
	basePath: "/",
	ipWhitelist: [],

	useHttps: false,
	httpsPrivateKey: "",
	httpsCertificate: "",

	hideConfigSecrets: true,

	language: "zh-tw",
	locale: "zh-TW",
	logLevel: ["INFO", "LOG", "WARN", "ERROR"],
	timeFormat: 24,
	units: "metric",

	watchTargets: [
		"config/config.js",
		"config/custom.css",
		"config/calendarEnv.js",
		"index.html",
		"css",
		"modules",
		"serveronly"
	],

	electronOptions: {
		fullscreen: true,
		webPreferences: {
			webviewTag: false
		}
	},

	modules: [
		{
			module: "alert"
		},
		{
			module: "MMM-Remote-Control",
			config: {
				apiKey: process.env.MM_REMOTE_API_KEY || "",
				secureEndpoints: true,
				customCommand: {
					monitorOnCommand:
						'export WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000; wlopm --on HDMI-A-1; sleep 0.5; wlr-randr --output HDMI-A-1 --on --mode 1480x320',
					monitorOffCommand:
						'export WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000; wlopm --off HDMI-A-1',
					monitorStatusCommand:
						'export WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000; wlopm | grep -q "HDMI-A-1 on" && echo true || echo false'
				}
			}
		},
		{
			module: "MMM-HomeKit",
			config: {
				screenControl: {
					name: "MagicMirror Monitor"
				},
				accentColor: false,
				pageControl: {
					name: "MagicMirror Pages",
					pages: ["此刻", "鏡頭", "影集"]
				},
				playerFocus: {
					name: "Player Focus"
				},
				toggleLyrics: false,
				useExperimentalBridge: false
			}
		},
		{
			module: "MMM-pages",
			config: {
				animationTime: 350,
				timings: { default: 0 },
				rotationHomePage: 0,
				homePage: 0,
				modules: [
					["page0"],
					["page2"],
					["page3"]
				],
				fixed: [
					"MMM-PageSwipe",
					"MMM-Remote-Control",
					"MMM-HomeKit",
					"alert"
				]
			}
		},
		{
			module: "MMM-PageSwipe",
			config: {
				minDistance: 60,
				maxTime: 900,
				// 鏡頭頁為滿版 video：不可忽略 UniFi／video，否則無法滑走
				ignoreSelector:
					"button, a, input, .indicator, .circle-wrapper, .mmm-playerfocus-btn, .mmm-playerfocus-brightness, .mmm-playerfocus-brightness-slider, .MMM-PlayerFocus, .ha-entity, .ha-touch-root, .ha-media-btn, .ha-media-progress, .ha-media-progress-track, .ha-climate-btn, .ha-brightness-slider"
			}
		},

		/* —— Page 0 此刻：左欄時間天氣 —— */
		{
			module: "clock",
			classes: "page0",
			position: "top_left",
			config: {
				displaySeconds: false,
				showPeriod: false,
				dateFormat: "M[月]D[日] ddd",
				showWeek: false
			}
		},
		{
			module: "weather",
			classes: "page0 weather-current",
			position: "top_left",
			config: {
				weatherProvider: "hko",
				type: "current",
				station: "${HKO_STATION}",
				themeDir: "themes/animated",
				onlyTemp: true,
				showHumidity: "temp",
				showSun: false,
				showFeelsLike: false,
				roundTemp: true,
				showPrecipitationAmount: false,
				showPrecipitationProbability: false,
				appendLocationNameToHeader: false
			}
		},
		{
			module: "weather",
			classes: "page0 weather-forecast",
			position: "top_left",
			config: {
				weatherProvider: "hko",
				type: "forecast",
				themeDir: "themes/animated",
				maxNumberOfDays: 3,
				tableClass: "xsmall",
				fade: false,
				roundTemp: true,
				colored: true,
				showPrecipitationProbability: true,
				appendLocationNameToHeader: false,
				forecastDateFormat: "ddd"
			}
		},

		/* —— Page 0 此刻：中欄到站（上）＋特別天氣（下）／行事曆／播放 —— */
		{
			module: "MMM-HK-Transport-ETA",
			classes: "page0 kmb-eta",
			position: "middle_center",
			config: {
				// 268X @ 洪水橋(洪福邨)總站開出；276P @ 洪元路洪福邨往上水
				transportETAProvider: "kmb",
				sta: "2DDEDEFABFB2ED87",
				stop_ids: [
					"2DDEDEFABFB2ED87",
					"A856593C105D479B"
				],
				routeStops: {
					"268X": "2DDEDEFABFB2ED87",
					"276P": "A856593C105D479B"
				},
				routes: ["268X", "276P"],
				dirs: ["O"],
				stopInfo: {
					stopName: "",
					lastUpdated: 1
				},
				reloadInterval: 10 * 1000,
				updateInterval: 0,
				animationSpeed: 0,
				tableClass: "small",
				showHeader: false,
				showDestination: false,
				displayRelativeTime: true,
				hideWhenEmpty: false,
				maximumEntries: 2
			}
		},
		{
			// 通知區域（上）：道路交通消息 — 紅色
			module: "MMM-TD-TrafficNews",
			classes: "page0 notifications td-traffic",
			position: "middle_center",
			config: {
				lang: "tc",
				header: "",
				maxItems: 2,
				hideWhenEmpty: true,
				updateInterval: 60 * 1000,
				locationKeywords: tdTrafficKeywords
			}
		},
		{
			// 通知區域（下）：天氣警告信號 — 黃色（只顯示 warnsum 信號名稱）
			module: "MMM-HKO-SpecialTips",
			classes: "page0 notifications hko-weather",
			position: "middle_center",
			config: {
				lang: "tc",
				header: "",
				maxTips: 5,
				hideWhenEmpty: true,
				updateInterval: 60 * 1000
			}
		},
		{
			module: "MMM-DHT11",
			classes: "page0 mmm-dht11",
			position: "middle_center",
			config: {
				updateInterval: 30 * 1000,
				gpioPin: 17
			}
		},
		{
			module: "calendar",
			classes: "page0 calendar-holidays",
			header: HOLIDAYS_NAME,
			position: "middle_center",
			config: {
				maximumEntries: 1,
				maximumNumberOfDays: 60,
				hideWhenEmpty: true,
				tableClass: "small",
				wrapEvents: false,
				maxTitleLength: 16,
				fade: false,
				displaySymbol: false,
				coloredText: true,
				timeFormat: "absolute",
				dateFormat: "M[月]D[日] ddd",
				dateFormatWithYear: "YYYY[年]M[月]D[日]",
				fullDayEventDateFormat: "M[月]D[日] ddd",
				fullDayEventDateFormatWithYear: "YYYY[年]M[月]D[日]",
				nextDaysRelative: true,
				hideTime: true,
				calendars: [
					{
						fetchInterval: 7 * 24 * 60 * 60 * 1000,
						name: HOLIDAYS_NAME,
						color: "#ff453a",
						url: "${HOLIDAYS_ICS_URL}"
					}
				]
			}
		},
		...(personalCalendars.length
			? [
				{
					module: "calendar",
					classes: "page0 calendar-personal",
					header: personalCalendarHeader(personalCalendars),
					position: "middle_center",
					config: {
						maximumEntries: 6,
						maximumNumberOfDays: 30,
						hideWhenEmpty: true,
						tableClass: "small",
						wrapEvents: false,
						maxTitleLength: 26,
						fade: true,
						fadePoint: 0.72,
						displaySymbol: false,
						coloredText: false,
						coloredBorder: true,
						timeFormat: "dateheaders",
						flipDateHeaderTitle: true,
						dateFormat: "M/D ddd",
						dateFormatWithYear: "YYYY/M/D ddd",
						fullDayEventDateFormat: "M/D ddd",
						fullDayEventDateFormatWithYear: "YYYY/M/D ddd",
						hideDuplicates: true,
						hideTime: false,
						showEnd: true,
						mergeConsecutiveFullDayEvents: true,
						calendars: personalCalendars
					}
				}
			]
			: []),
		{
			module: "MMM-HomeAssistant-Touch",
			classes: "page0 ha-media",
			position: "middle_center",
			config: {
				host: haHost,
				port: haPort,
				token: process.env.HA_TOKEN || "",
				ignoreCert: true,
				entities: [
					"media_player.wo_shi_homepod_mini",
					"media_player.shui_fang_shui_fang_de_apple_tv",
					"media_player.ke_ting_samsung_soundbar_q990b",
					"media_player.av_samsung_soundbar_q990b_2"
				]
			}
		},
		{
			module: "MMM-PlayerFocus",
			classes: "page0",
			position: "middle_center",
			config: {}
		},
		{
			module: "MMM-HomeAssistant-Touch",
			classes: "page0 ha-controls",
			position: "middle_center",
			config: {
				host: haHost,
				port: haPort,
				token: process.env.HA_TOKEN || "",
				ignoreCert: true,
				entities: [
					"climate.wo_shi_leng_qi",
					"light.wo_shi_shui_fang_deng",
					"light.aqara_wall_switch_d1",
					"switch.wo_shi_feng_shan",
					"switch.wo_shi_04018130496"
				]
			}
		},

		/* —— Page 2 鏡頭 —— */
		{
			module: "MMM-UniFiProtect",
			classes: "page2",
			position: "middle_center",
			config: {
				host: "${UNIFI_PROTECT_HOST}",
				username: "${UNIFI_PROTECT_USERNAME}",
				password: "${UNIFI_PROTECT_PASSWORD}",
				apiKey: "${UNIFI_PROTECT_API_KEY}",
				cameras: String("${UNIFI_PROTECT_CAMERA_NAMES}")
					.split(",")
					.map((s) => s.trim())
					.filter((s) => s.length > 0)
					.map((name) => ({ name })),
				protectNativeLive: true,
				compactMode: true,
				showMotionEvents: false,
				showRingEvents: false,
				showSmartEvents: false,
				useMagicMirrorAlerts: false,
				doorbellOverlay: false,
				debugLogging: false
			}
		},

		/* —— Page 3 影集 —— */
		{
			module: "MMM-Sonarr",
			classes: "page3",
			header: "影集",
			position: "middle_center",
			config: {
				apiKey: "${SONARR_API_KEY}",
				baseUrl: "${SONARR_BASE_URL}",
				upcomingLimit: 8,
				historyLimit: 6,
				updateInterval: 5 * 60 * 1000,
				language: "zh-tw"
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
