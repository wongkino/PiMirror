#!/usr/bin/env node
"use strict";

/**
 * PiMirror dashboard server — UI + APIs for DHT / HKO weather / calendars.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { loadEnvFile } = require("node:process");

const ROOT = path.resolve(__dirname);
const MM_ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const ENV_FILE = path.join(MM_ROOT, "config", "config.env");
const PORT = Number(process.env.DASHBOARD_PORT || 8090);

if (fs.existsSync(ENV_FILE)) {
	try {
		loadEnvFile(ENV_FILE);
	} catch {
		/* ignore */
	}
}

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".json": "application/json; charset=utf-8"
};

function sendJson (res, status, body) {
	const data = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store"
	});
	res.end(data);
}

async function fetchText (url, timeoutMs = 15000) {
	const res = await fetch(url, {
		headers: { "Cache-Control": "no-cache", "User-Agent": "PiMirror/1.0" },
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	return res.text();
}

async function fetchJson (url, timeoutMs = 15000) {
	const text = await fetchText(url, timeoutMs);
	return JSON.parse(text);
}

function unfoldIcs (raw) {
	return raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function parseIcsEvents (raw, { name, color }) {
	const text = unfoldIcs(raw);
	const blocks = text.split("BEGIN:VEVENT").slice(1);
	const events = [];
	const now = new Date();
	const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

	for (const block of blocks) {
		const body = block.split("END:VEVENT")[0] || "";
		const summary = (body.match(/^SUMMARY(?:;[^:]*)?:(.+)$/m) || [])[1]?.trim();
		if (!summary) continue;

		const dtStartLine = body.match(/^DTSTART([^:]*):(\S+)$/m);
		if (!dtStartLine) continue;
		const params = dtStartLine[1] || "";
		const value = dtStartLine[2].trim();
		const allDay = /VALUE=DATE/i.test(params) || /^\d{8}$/.test(value);
		let start;
		if (allDay) {
			const y = value.slice(0, 4);
			const m = value.slice(4, 6);
			const d = value.slice(6, 8);
			start = new Date(`${y}-${m}-${d}T00:00:00`);
		} else {
			const iso = value.includes("T")
				? value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/, "$1-$2-$3T$4:$5:$6Z")
				: value;
			start = new Date(iso);
		}
		if (Number.isNaN(start.getTime())) continue;
		if (start < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)) continue;
		if (start > horizon) continue;

		events.push({
			title: summary.replace(/\\,/g, ",").replace(/\\n/g, " "),
			start: start.toISOString(),
			allDay,
			calendar: name,
			color
		});
	}
	return events;
}

async function readDht () {
	const python = path.join(MM_ROOT, "GPIO", ".venv", "bin", "python");
	const script = path.join(MM_ROOT, "GPIO", "dht11-json.py");
	if (!fs.existsSync(python) || !fs.existsSync(script)) {
		return { ok: false, error: "missing_reader" };
	}
	return new Promise((resolve) => {
		const child = spawn(python, [script], { stdio: ["ignore", "pipe", "pipe"] });
		let out = "";
		let err = "";
		child.stdout.on("data", (c) => {
			out += c.toString();
		});
		child.stderr.on("data", (c) => {
			err += c.toString();
		});
		child.on("error", (e) => resolve({ ok: false, error: e.message }));
		child.on("close", () => {
			try {
				const line = out.trim().split("\n").filter(Boolean).pop() || "";
				resolve(JSON.parse(line));
			} catch {
				resolve({ ok: false, error: err || "parse_failed" });
			}
		});
	});
}

function iconAnimClass (icon) {
	const n = Number(icon) || 0;
	if ([50, 51, 70, 71, 72, 73, 74, 75].includes(n)) return "sunny";
	if ([52, 60, 61, 76, 77, 78].includes(n)) return "cloudy";
	if ([53, 54, 62, 63, 64].includes(n)) return "rain";
	if ([65].includes(n)) return "storm";
	if (n >= 80 && n < 90) return "windy";
	if (n >= 90) return "hot";
	return "cloudy";
}

function parseCoord (raw, hemiPos, hemiNeg) {
	const m = String(raw || "").trim().match(/([\d.]+)\s*([A-Za-z])/);
	if (!m) return null;
	let v = Number(m[1]);
	if (Number.isNaN(v)) return null;
	const h = m[2].toUpperCase();
	if (h === hemiNeg) v = -v;
	else if (h !== hemiPos) return null;
	return v;
}

function parseTrackBlocks (xml, tag) {
	const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
	const out = [];
	let m;
	while ((m = re.exec(xml))) {
		const block = m[1];
		const lat = parseCoord((block.match(/<Latitude>([^<]+)/) || [])[1], "N", "S");
		const lon = parseCoord((block.match(/<Longitude>([^<]+)/) || [])[1], "E", "W");
		if (lat == null || lon == null) continue;
		out.push({
			lat,
			lon,
			time: ((block.match(/<Time>([^<]+)/) || [])[1] || "").trim() || null,
			intensity: ((block.match(/<Intensity>([^<]+)/) || [])[1] || "").trim() || null,
			wind: ((block.match(/<MaximumWind>([^<]+)/) || [])[1] || "").trim() || null
		});
	}
	return out;
}

async function getWeather () {
	const station = String(process.env.HKO_STATION || "元朗公園").trim();
	const [rhr, warn, fnd, swt, flw] = await Promise.all([
		fetchJson("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc"),
		fetchJson("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc"),
		fetchJson("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=tc"),
		fetchJson("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=swt&lang=tc"),
		fetchJson("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=flw&lang=tc")
	]);

	const temps = Array.isArray(rhr?.temperature?.data) ? rhr.temperature.data : [];
	const match =
		temps.find((t) => t.place === station)
		|| temps.find((t) => `${t.place || ""}`.includes(station.replace(/公園$/, "")))
		|| temps[0];
	const humidity = Array.isArray(rhr?.humidity?.data) ? rhr.humidity.data[0] : null;

	const warnings = [];
	for (const entry of Object.values(warn || {})) {
		if (!entry || typeof entry !== "object") continue;
		if (`${entry.actionCode || ""}`.toUpperCase() === "CANCEL") continue;
		const name = `${entry.name || ""}`.trim();
		if (name) warnings.push(name);
	}

	const tips = [];
	for (const item of Array.isArray(swt?.swt) ? swt.swt : []) {
		const desc = `${item?.desc || ""}`.trim();
		if (desc) tips.push(desc);
	}
	if (!tips.length) {
		const fallback = `${flw?.forecastDesc || flw?.outlook || ""}`.trim();
		if (fallback) tips.push(fallback);
	}

	const icon = rhr?.icon?.[0] ?? null;
	const forecast = (Array.isArray(fnd?.weatherForecast) ? fnd.weatherForecast : [])
		.slice(0, 5)
		.map((day) => ({
			date: day.forecastDate,
			week: day.week,
			weather: day.forecastWeather,
			icon: day.ForecastIcon,
			anim: iconAnimClass(day.ForecastIcon),
			max: day.forecastMaxtemp?.value ?? null,
			min: day.forecastMintemp?.value ?? null,
			psr: day.PSR || ""
		}));

	return {
		ok: true,
		station: match?.place || station,
		temperature: match?.value ?? null,
		humidity: humidity?.value ?? null,
		icon,
		anim: iconAnimClass(icon),
		iconUrl: icon
			? `https://www.hko.gov.hk/images/HKOWxIconOutline/pic${icon}.png`
			: null,
		warnings,
		tips,
		forecast,
		updateTime: rhr?.updateTime || null
	};
}

const BUS_ROUTES = [
	{ route: "268X", stopId: "2DDEDEFABFB2ED87", dir: "O" },
	{ route: "276P", stopId: "A856593C105D479B", dir: "O" }
];
const BUS_MAX_ETAS = 2;

async function getBus () {
	const now = Date.now();
	const lines = await Promise.all(
		BUS_ROUTES.map(async ({ route, stopId, dir }) => {
			try {
				const data = await fetchJson(
					`https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${stopId}`
				);
				const rows = (Array.isArray(data?.data) ? data.data : [])
					.filter(
						(r) =>
							r
							&& r.route === route
							&& (!dir || r.dir === dir)
							&& r.eta
					)
					.sort((a, b) => String(a.eta).localeCompare(String(b.eta)));

				const seen = new Set();
				const etas = [];
				for (const r of rows) {
					const key = r.eta;
					if (seen.has(key)) continue;
					seen.add(key);
					const t = new Date(r.eta).getTime();
					if (Number.isNaN(t)) continue;
					const mins = Math.max(0, Math.round((t - now) / 60000));
					etas.push({
						eta: r.eta,
						mins,
						dest: r.dest_tc || r.dest_en || "",
						remark: r.rmk_tc || ""
					});
					if (etas.length >= BUS_MAX_ETAS) break;
				}

				return {
					route,
					dest: etas[0]?.dest || "",
					etas
				};
			} catch (e) {
				console.error(`[bus] ${route}: ${e.message}`);
				return { route, dest: "", etas: [], error: e.message };
			}
		})
	);

	return { ok: true, lines, updateTime: new Date().toISOString() };
}

async function getStorm () {
	let listXml;
	try {
		listXml = await fetchText("https://www.weather.gov.hk/wxinfo/currwx/tc_list.xml");
	} catch {
		return { ok: true, active: false, storms: [] };
	}
	if (!/<TropicalCyclone>/i.test(listXml)) {
		return { ok: true, active: false, storms: [] };
	}

	const storms = [];
	const re = /<TropicalCyclone>([\s\S]*?)<\/TropicalCyclone>/g;
	let m;
	while ((m = re.exec(listXml))) {
		const block = m[1];
		const id = ((block.match(/<TropicalCycloneID>([^<]+)/) || [])[1] || "").trim();
		const nameZh = ((block.match(/<TropicalCycloneChineseName>([^<]+)/) || [])[1] || "").trim();
		const nameEn = ((block.match(/<TropicalCycloneEnglishName>([^<]+)/) || [])[1] || "").trim();
		let trackUrl = ((block.match(/<TropicalCycloneURL>([^<]+)/) || [])[1] || "").trim();
		if (!trackUrl) continue;
		trackUrl = trackUrl.replace(/^http:\/\//i, "https://");

		let trackXml = "";
		try {
			trackXml = await fetchText(trackUrl);
		} catch (e) {
			console.error(`[storm] track ${id}: ${e.message}`);
			continue;
		}

		const past = parseTrackBlocks(trackXml, "PastInformation");
		const analysis = parseTrackBlocks(trackXml, "AnalysisInformation");
		let forecast = parseTrackBlocks(trackXml, "ForecastInformation");
		// Keep SVG light: sample forecast points
		if (forecast.length > 24) {
			const step = Math.ceil(forecast.length / 24);
			forecast = forecast.filter((_, i) => i % step === 0 || i === forecast.length - 1);
		}

		storms.push({
			id,
			nameZh: nameZh || nameEn || id,
			nameEn,
			past,
			analysis,
			forecast,
			current: analysis[analysis.length - 1] || past[past.length - 1] || null
		});
	}

	return { ok: true, active: storms.length > 0, storms };
}

async function getCalendar () {
	const sources = [
		{
			name: "公眾假期",
			color: "#ff453a",
			url: String(process.env.HOLIDAYS_ICS_URL || "https://www.1823.gov.hk/common/ical/tc.ics").trim()
		}
	];
	const personalUrl = String(process.env.CALENDAR_URL || "").trim();
	if (personalUrl) {
		sources.push({
			name: String(process.env.CALENDAR_NAME || "行事曆").trim(),
			color: String(process.env.CALENDAR_COLOR || "#0a84ff").trim(),
			url: personalUrl
		});
	}

	const events = [];
	for (const src of sources) {
		try {
			const raw = await fetchText(src.url);
			events.push(...parseIcsEvents(raw, src));
		} catch (e) {
			console.error(`[calendar] ${src.name}: ${e.message}`);
		}
	}
	events.sort((a, b) => new Date(a.start) - new Date(b.start));
	return { ok: true, events: events.slice(0, 12) };
}

const HA_CONTROLS = [
	"climate.wo_shi_leng_qi",
	"light.wo_shi_shui_fang_deng",
	"light.aqara_wall_switch_d1",
	"switch.wo_shi_feng_shan",
	"switch.wo_shi_04018130496"
];

const HA_MEDIA_PLAYERS = [
	"media_player.wo_shi_homepod_mini",
	"media_player.shui_fang_shui_fang_de_apple_tv",
	"media_player.ke_ting_samsung_soundbar_q990b",
	"media_player.av_samsung_soundbar_q990b_2"
];

const HA_ENTITIES = [...HA_CONTROLS, ...HA_MEDIA_PLAYERS];

const haArtCache = new Map();

function haBaseUrl () {
	const fromUrl = String(process.env.HA_URL || "").trim().replace(/\/$/, "");
	if (fromUrl) return fromUrl;
	const host = String(process.env.HA_HOST || "10.0.0.2").trim();
	const port = String(process.env.HA_PORT || "8123").trim();
	return `http://${host}:${port}`;
}

function haHeaders () {
	const token = String(process.env.HA_TOKEN || "").trim();
	if (!token) throw new Error("missing_ha_token");
	return {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
		"User-Agent": "PiMirror/1.0"
	};
}

async function haFetch (pathname, { method = "GET", body, timeoutMs = 10000 } = {}) {
	const res = await fetch(`${haBaseUrl()}${pathname}`, {
		method,
		headers: haHeaders(),
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`HA ${res.status} ${pathname} ${text.slice(0, 120)}`);
	}
	if (res.status === 204) return null;
	const text = await res.text();
	if (!text) return null;
	return JSON.parse(text);
}

function summarizeHaState (state) {
	if (!state || !state.entity_id) return null;
	const domain = state.entity_id.split(".")[0];
	const attrs = state.attributes || {};
	const out = {
		entity_id: state.entity_id,
		domain,
		state: state.state,
		name: attrs.friendly_name || state.entity_id,
		icon: attrs.icon || null
	};
	if (domain === "climate") {
		out.current = attrs.current_temperature ?? null;
		out.target = attrs.temperature ?? null;
		out.min = Number(attrs.min_temp ?? 16);
		out.max = Number(attrs.max_temp ?? 30);
		out.hvacModes = attrs.hvac_modes || ["off", "cool"];
	}
	if (domain === "light") {
		out.brightness =
			typeof attrs.brightness === "number"
				? Math.round((attrs.brightness / 255) * 100)
				: null;
	}
	if (domain === "media_player") {
		out.title = attrs.media_title || null;
		out.artist = attrs.media_artist || null;
		out.album = attrs.media_album_name || null;
		out.app = attrs.app_name || attrs.source || null;
		out.duration = Number.isFinite(Number(attrs.media_duration)) ? Number(attrs.media_duration) : null;
		out.position = Number.isFinite(Number(attrs.media_position)) ? Number(attrs.media_position) : null;
		out.positionUpdated = attrs.media_position_updated_at || null;
		out.artUrl = resolveMediaArtUrl(attrs);
	}
	return out;
}

function resolveMediaArtUrl (attrs) {
	if (!attrs) return null;
	const pic = attrs.entity_picture;
	if (typeof pic === "string" && pic.trim()) {
		if (/^https?:\/\//i.test(pic)) return pic;
		if (pic.startsWith("/")) return `${haBaseUrl()}${pic}`;
	}
	const contentId = attrs.media_content_id;
	if (typeof contentId === "string" && /^[\w-]{11}$/.test(contentId)) {
		return `https://i.ytimg.com/vi/${contentId}/hqdefault.jpg`;
	}
	return attrs.resolved_art_url || null;
}

async function lookupItunesArt (artist, title) {
	const cacheKey = `${artist || ""}|${title || ""}`.toLowerCase();
	if (haArtCache.has(cacheKey)) return haArtCache.get(cacheKey);
	try {
		const q = encodeURIComponent([artist, title].filter(Boolean).join(" "));
		const res = await fetch(
			`https://itunes.apple.com/search?term=${q}&media=music&limit=1`,
			{ signal: AbortSignal.timeout(5000) }
		);
		if (!res.ok) return null;
		const data = await res.json();
		const small = data.results?.[0]?.artworkUrl100;
		if (!small) return null;
		const artUrl = String(small)
			.replace("100x100bb", "600x600bb")
			.replace("100x100", "600x600");
		haArtCache.set(cacheKey, artUrl);
		return artUrl;
	} catch {
		return null;
	}
}

async function enrichMediaState (state) {
	if (!state?.entity_id?.startsWith("media_player.")) return state;
	const attrs = state.attributes || {};
	let artUrl = resolveMediaArtUrl(attrs);
	if (!artUrl && attrs.media_title) {
		artUrl = await lookupItunesArt(attrs.media_artist, attrs.media_title);
	}
	if (!artUrl) return state;
	return {
		...state,
		attributes: {
			...attrs,
			resolved_art_url: artUrl
		}
	};
}

async function getHaStates () {
	const wanted = new Set(HA_ENTITIES);
	const all = await haFetch("/api/states");
	const byId = new Map((Array.isArray(all) ? all : []).map((s) => [s.entity_id, s]));
	const entities = [];
	for (const id of HA_ENTITIES) {
		let s = byId.get(id);
		if (s?.entity_id?.startsWith("media_player.")) {
			s = await enrichMediaState(s);
		}
		entities.push(
			s ? summarizeHaState(s) : { entity_id: id, domain: id.split(".")[0], state: "unavailable", name: id }
		);
	}
	return { ok: true, entities: entities.filter((e) => wanted.has(e.entity_id)) };
}

async function haToggle (entityId) {
	if (!HA_ENTITIES.includes(entityId)) throw new Error("entity_not_allowed");
	const domain = entityId.split(".")[0];
	await haFetch(`/api/services/${domain}/toggle`, {
		method: "POST",
		body: { entity_id: entityId }
	});
	const state = await haFetch(`/api/states/${entityId}`);
	return { ok: true, entity: summarizeHaState(state) };
}

async function haClimate (entityId, action, payload = {}) {
	if (!HA_ENTITIES.includes(entityId)) throw new Error("entity_not_allowed");
	if (!entityId.startsWith("climate.")) throw new Error("not_climate");

	if (action === "power") {
		const state = await haFetch(`/api/states/${entityId}`);
		const modes = state?.attributes?.hvac_modes || ["off", "cool"];
		const isOn = state?.state && state.state !== "off";
		const onMode = modes.includes("cool") ? "cool" : modes.find((m) => m !== "off") || "cool";
		await haFetch("/api/services/climate/set_hvac_mode", {
			method: "POST",
			body: { entity_id: entityId, hvac_mode: isOn ? "off" : onMode }
		});
	} else if (action === "temp") {
		const temperature = Number(payload.temperature);
		if (Number.isNaN(temperature)) throw new Error("bad_temperature");
		await haFetch("/api/services/climate/set_temperature", {
			method: "POST",
			body: { entity_id: entityId, temperature }
		});
	} else {
		throw new Error("bad_action");
	}

	const state = await haFetch(`/api/states/${entityId}`);
	return { ok: true, entity: summarizeHaState(state) };
}

async function haMedia (entityId, action) {
	if (!HA_MEDIA_PLAYERS.includes(entityId)) throw new Error("entity_not_allowed");
	const services = {
		play_pause: "media_play_pause",
		next: "media_next_track",
		previous: "media_previous_track"
	};
	const service = services[action];
	if (!service) throw new Error("bad_action");
	await haFetch(`/api/services/media_player/${service}`, {
		method: "POST",
		body: { entity_id: entityId }
	});
	let state = await haFetch(`/api/states/${entityId}`);
	state = await enrichMediaState(state);
	return { ok: true, entity: summarizeHaState(state) };
}

async function streamHaMediaArt (entityId, res) {
	if (!HA_MEDIA_PLAYERS.includes(entityId)) throw new Error("entity_not_allowed");
	let state = await haFetch(`/api/states/${entityId}`);
	state = await enrichMediaState(state);
	const artUrl = resolveMediaArtUrl(state?.attributes || {});
	if (!artUrl) throw new Error("no_art");
	const headers = /^https?:\/\//i.test(artUrl) && !artUrl.startsWith(haBaseUrl())
		? {}
		: haHeaders();
	const imgRes = await fetch(artUrl, {
		headers,
		signal: AbortSignal.timeout(10000)
	});
	if (!imgRes.ok) throw new Error(`art_${imgRes.status}`);
	const buf = Buffer.from(await imgRes.arrayBuffer());
	const type = imgRes.headers.get("content-type") || "image/jpeg";
	res.writeHead(200, {
		"Content-Type": type,
		"Cache-Control": "public, max-age=300"
	});
	res.end(buf);
}

function readBody (req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => {
			const raw = Buffer.concat(chunks).toString("utf8");
			if (!raw) return resolve({});
			try {
				resolve(JSON.parse(raw));
			} catch (e) {
				reject(new Error("invalid_json"));
			}
		});
		req.on("error", reject);
	});
}

function serveStatic (req, res, urlPath) {
	const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
	const filePath = path.join(PUBLIC, safe === "/" ? "index.html" : safe);
	if (!filePath.startsWith(PUBLIC)) {
		res.writeHead(403);
		res.end("Forbidden");
		return;
	}
	fs.readFile(filePath, (err, data) => {
		if (err) {
			res.writeHead(404);
			res.end("Not found");
			return;
		}
		const ext = path.extname(filePath);
		res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
		res.end(data);
	});
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

	try {
		if (url.pathname === "/api/health") {
			sendJson(res, 200, { ok: true });
			return;
		}
		if (url.pathname === "/api/dht") {
			sendJson(res, 200, await readDht());
			return;
		}
		if (url.pathname === "/api/weather") {
			sendJson(res, 200, await getWeather());
			return;
		}
		if (url.pathname === "/api/bus") {
			sendJson(res, 200, await getBus());
			return;
		}
		if (url.pathname === "/api/storm") {
			sendJson(res, 200, await getStorm());
			return;
		}
		if (url.pathname === "/api/calendar") {
			sendJson(res, 200, await getCalendar());
			return;
		}
		if (url.pathname === "/api/ha/states") {
			sendJson(res, 200, await getHaStates());
			return;
		}
		if (url.pathname === "/api/ha/toggle" && req.method === "POST") {
			const body = await readBody(req);
			sendJson(res, 200, await haToggle(String(body.entity || "")));
			return;
		}
		if (url.pathname === "/api/ha/climate" && req.method === "POST") {
			const body = await readBody(req);
			sendJson(
				res,
				200,
				await haClimate(String(body.entity || ""), String(body.action || ""), body)
			);
			return;
		}
		if (url.pathname === "/api/ha/media" && req.method === "POST") {
			const body = await readBody(req);
			sendJson(
				res,
				200,
				await haMedia(String(body.entity || ""), String(body.action || ""))
			);
			return;
		}
		if (url.pathname === "/api/ha/art") {
			await streamHaMediaArt(String(url.searchParams.get("entity") || ""), res);
			return;
		}
		if (url.pathname.startsWith("/api/")) {
			sendJson(res, 404, { ok: false, error: "not_found" });
			return;
		}
		serveStatic(req, res, url.pathname);
	} catch (e) {
		console.error(e);
		sendJson(res, 500, { ok: false, error: e.message || "server_error" });
	}
});

server.listen(PORT, "0.0.0.0", () => {
	console.log(`PiMirror http://127.0.0.1:${PORT}  (root ${MM_ROOT})`);
});
