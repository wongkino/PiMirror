"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { exec, spawn } = require("child_process");
const NodeHelper = require("node_helper");

const ENV_PATH = path.join(__dirname, "..", "..", "config", "config.env");
const PUBLIC_DIR = path.join(__dirname, "public");
const COOKIE_NAME = "mm_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const FIELD_META = [
	{ key: "CALENDAR_URL", label: "日曆 URL", type: "text", group: "日曆" },
	{ key: "CALENDAR_NAME", label: "日曆名稱", type: "text", group: "日曆" },
	{ key: "CALENDAR_COLOR", label: "日曆顏色", type: "color", group: "日曆" },
	{ key: "HOLIDAYS_ICS_URL", label: "公眾假期 ICS URL", type: "text", group: "日曆" },
	{ key: "HKO_STATION", label: "天文台測站名稱", type: "text", group: "天氣" },
	{ key: "KMB_STOP_ID", label: "九巴站點 ID", type: "text", group: "交通" },
	{ key: "UNIFI_PROTECT_HOST", label: "Protect 主機", type: "text", group: "UniFi Protect" },
	{ key: "UNIFI_PROTECT_USERNAME", label: "使用者名稱", type: "text", group: "UniFi Protect" },
	{ key: "UNIFI_PROTECT_PASSWORD", label: "密碼", type: "password", group: "UniFi Protect" },
	{ key: "UNIFI_PROTECT_API_KEY", label: "API Key（可選）", type: "password", group: "UniFi Protect" },
	{
		key: "UNIFI_PROTECT_CAMERA_NAMES",
		label: "已選攝影機（逗號分隔＝顯示次序，可選 1～2 部）",
		type: "text",
		group: "UniFi Protect"
	},
	{ key: "SONARR_BASE_URL", label: "Sonarr 網址", type: "text", group: "Sonarr" },
	{ key: "SONARR_API_KEY", label: "Sonarr API Key", type: "password", group: "Sonarr" }
];

const ADMIN_SECRET_KEYS = ["ADMIN_PASSWORD", "ADMIN_PASSWORD_HASH"];
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

const sessions = new Map();

function parseEnvFile (content) {
	const values = {};
	const lines = content.split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq <= 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let val = trimmed.slice(eq + 1).trim();
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			val = val.slice(1, -1);
		}
		values[key] = val;
	}
	return values;
}

function readEnvValues () {
	if (!fs.existsSync(ENV_PATH)) return {};
	return parseEnvFile(fs.readFileSync(ENV_PATH, "utf8"));
}

function quoteValue (val) {
	const s = String(val ?? "");
	if (/[\s#"']/.test(s) || s === "") {
		return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	}
	return s;
}

function writeEnvFile (filePath, updates, { remove = [] } = {}) {
	let original = "";
	if (fs.existsSync(filePath)) {
		original = fs.readFileSync(filePath, "utf8");
	}

	const removeSet = new Set(remove);
	const lines = original ? original.split(/\r?\n/) : [];
	const seen = new Set();
	const out = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			out.push(line);
			continue;
		}
		const eq = trimmed.indexOf("=");
		if (eq <= 0) {
			out.push(line);
			continue;
		}
		const key = trimmed.slice(0, eq).trim();
		if (removeSet.has(key)) {
			seen.add(key);
			continue;
		}
		if (Object.prototype.hasOwnProperty.call(updates, key)) {
			out.push(`${key}=${quoteValue(updates[key])}`);
			seen.add(key);
		} else {
			out.push(line);
		}
	}

	for (const [key, val] of Object.entries(updates)) {
		if (!seen.has(key) && !removeSet.has(key)) {
			out.push(`${key}=${quoteValue(val)}`);
		}
	}

	const text = `${out.join("\n").replace(/\n+$/, "")}\n`;
	fs.writeFileSync(filePath, text, "utf8");
}

function isScryptHash (stored) {
	return String(stored || "").startsWith("scrypt$");
}

function hashPassword (password) {
	const salt = crypto.randomBytes(16);
	const derived = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN, {
		N: SCRYPT_N,
		r: SCRYPT_R,
		p: SCRYPT_P
	});
	return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyScryptHash (password, stored) {
	const parts = String(stored).split("$");
	if (parts.length !== 6 || parts[0] !== "scrypt") return false;
	const N = Number(parts[1]);
	const r = Number(parts[2]);
	const p = Number(parts[3]);
	const salt = Buffer.from(parts[4], "hex");
	const expected = Buffer.from(parts[5], "hex");
	if (!salt.length || !expected.length || !N || !r || !p) return false;
	const actual = crypto.scryptSync(String(password), salt, expected.length, { N, r, p });
	return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function hasAdminPasswordConfigured () {
	const values = readEnvValues();
	return Boolean(values.ADMIN_PASSWORD_HASH || values.ADMIN_PASSWORD);
}

function verifyAdminPassword (password) {
	const values = readEnvValues();
	const hashed = String(values.ADMIN_PASSWORD_HASH || "");
	if (hashed) {
		return isScryptHash(hashed) ? verifyScryptHash(password, hashed) : false;
	}
	const legacy = String(values.ADMIN_PASSWORD || "");
	if (!legacy) return false;
	return safeEqual(password, legacy);
}

function setAdminPassword (password) {
	writeEnvFile(
		ENV_PATH,
		{ ADMIN_PASSWORD_HASH: hashPassword(password) },
		{ remove: ["ADMIN_PASSWORD"] }
	);
}

function publicEnvValues (values) {
	const out = { ...values };
	for (const key of ADMIN_SECRET_KEYS) {
		delete out[key];
	}
	return out;
}

function parseCookies (req) {
	const out = {};
	const raw = req.headers.cookie || "";
	for (const part of raw.split(";")) {
		const idx = part.indexOf("=");
		if (idx < 0) continue;
		const k = part.slice(0, idx).trim();
		const v = part.slice(idx + 1).trim();
		if (k) out[k] = decodeURIComponent(v);
	}
	return out;
}

function setSessionCookie (res, token) {
	res.setHeader(
		"Set-Cookie",
		`${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
	);
}

function clearSessionCookie (res) {
	res.setHeader(
		"Set-Cookie",
		`${COOKIE_NAME}=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0`
	);
}

function createSession () {
	const token = crypto.randomBytes(24).toString("hex");
	sessions.set(token, { exp: Date.now() + SESSION_TTL_MS });
	return token;
}

function isAuthed (req) {
	const token = parseCookies(req)[COOKIE_NAME];
	if (!token) return false;
	const sess = sessions.get(token);
	if (!sess) return false;
	if (sess.exp <= Date.now()) {
		sessions.delete(token);
		return false;
	}
	sess.exp = Date.now() + SESSION_TTL_MS;
	return true;
}

function safeEqual (a, b) {
	const aa = Buffer.from(String(a));
	const bb = Buffer.from(String(b));
	if (aa.length !== bb.length) return false;
	return crypto.timingSafeEqual(aa, bb);
}

function normalizeCameraNames (raw) {
	return String(raw || "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function cameraNamesFromEnv (values) {
	if (values.UNIFI_PROTECT_CAMERA_NAMES) {
		return normalizeCameraNames(values.UNIFI_PROTECT_CAMERA_NAMES);
	}
	return [
		values.UNIFI_PROTECT_CAMERA_NAME,
		values.UNIFI_PROTECT_CAMERA_NAME_2
	].map((s) => String(s || "").trim()).filter(Boolean);
}

async function listProtectCameras ({ host, username, password }) {
	if (!host || !username || !password) {
		throw new Error("請先填寫 Protect 主機、使用者名稱與密碼");
	}
	const apiFile = path.join(
		__dirname,
		"..",
		"MMM-UniFiProtect",
		"node_modules",
		"unifi-protect",
		"dist",
		"protect-api.js"
	);
	if (!fs.existsSync(apiFile)) {
		throw new Error("找不到 unifi-protect 套件（請確認已安裝 MMM-UniFiProtect）");
	}
	const { pathToFileURL } = require("url");
	const { resolveProtectApiExport } = require("../MMM-UniFiProtect/helpers/resolve-protect-api-export");
	const ns = await import(pathToFileURL(apiFile).href);
	const ProtectApi = resolveProtectApiExport(ns);
	if (!ProtectApi) throw new Error("無法載入 ProtectApi");

	const log = {
		debug () {},
		info () {},
		warn () {},
		error () {}
	};
	const api = new ProtectApi(log);
	const loginOk = await Promise.race([
		api.login(String(host).trim(), String(username).trim(), String(password)),
		new Promise((_, reject) => setTimeout(() => reject(new Error("登入逾時")), 20000))
	]);
	if (!loginOk) throw new Error("Protect 登入失敗（請檢查帳密／主機）");

	await Promise.race([
		api.getBootstrap(),
		new Promise((_, reject) => setTimeout(() => reject(new Error("取得攝影機列表逾時")), 20000))
	]);

	const cams = Array.isArray(api.bootstrap?.cameras) ? api.bootstrap.cameras : [];
	return cams
		.map((c) => ({
			id: c.id || "",
			name: c.name || c.id || "",
			state: c.state || ""
		}))
		.filter((c) => c.name)
		.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}

function expandCameraUpdates (updates) {
	if (!Object.prototype.hasOwnProperty.call(updates, "UNIFI_PROTECT_CAMERA_NAMES")) {
		return updates;
	}
	const names = normalizeCameraNames(updates.UNIFI_PROTECT_CAMERA_NAMES).slice(0, 2);
	updates.UNIFI_PROTECT_CAMERA_NAMES = names.join(",");
	updates.UNIFI_PROTECT_CAMERA_NAME = names[0] || "";
	updates.UNIFI_PROTECT_CAMERA_NAME_2 = names[1] || "";
	return updates;
}

module.exports = NodeHelper.create({
	start () {
		// One-time migrate: plaintext ADMIN_PASSWORD → ADMIN_PASSWORD_HASH
		try {
			const values = readEnvValues();
			if (values.ADMIN_PASSWORD && !values.ADMIN_PASSWORD_HASH) {
				setAdminPassword(values.ADMIN_PASSWORD);
				console.log(`[${this.name}] Migrated ADMIN_PASSWORD → ADMIN_PASSWORD_HASH`);
			}
		} catch (err) {
			console.error(`[${this.name}] password migrate failed:`, err.message);
		}

		const router = express.Router();
		router.use(express.json({ limit: "256kb" }));

		router.get("/api/status", (req, res) => {
			res.json({
				ok: true,
				authenticated: isAuthed(req),
				needsSetup: !hasAdminPasswordConfigured()
			});
		});

		router.post("/api/setup", (req, res) => {
			try {
				if (hasAdminPasswordConfigured()) {
					return res.status(400).json({ ok: false, error: "密碼已設定，請登入" });
				}
				const password = String((req.body && req.body.password) || "");
				if (password.length < 4) {
					return res.status(400).json({ ok: false, error: "密碼至少 4 個字元" });
				}
				setAdminPassword(password);
				const token = createSession();
				setSessionCookie(res, token);
				res.json({ ok: true });
			} catch (err) {
				res.status(500).json({ ok: false, error: err.message });
			}
		});

		router.post("/api/login", (req, res) => {
			try {
				if (!hasAdminPasswordConfigured()) {
					return res.status(400).json({ ok: false, error: "請先設定密碼", needsSetup: true });
				}
				const password = String((req.body && req.body.password) || "");
				if (!verifyAdminPassword(password)) {
					return res.status(401).json({ ok: false, error: "密碼錯誤" });
				}
				// Migrate legacy plaintext ADMIN_PASSWORD → hashed
				const values = readEnvValues();
				if (values.ADMIN_PASSWORD && !values.ADMIN_PASSWORD_HASH) {
					setAdminPassword(password);
				}
				const token = createSession();
				setSessionCookie(res, token);
				res.json({ ok: true });
			} catch (err) {
				res.status(500).json({ ok: false, error: err.message });
			}
		});

		router.post("/api/logout", (req, res) => {
			const token = parseCookies(req)[COOKIE_NAME];
			if (token) sessions.delete(token);
			clearSessionCookie(res);
			res.json({ ok: true });
		});

		const requireAuth = (req, res, next) => {
			if (isAuthed(req)) return next();
			return res.status(401).json({ ok: false, error: "未登入", needLogin: true });
		};

		router.post("/api/password", requireAuth, (req, res) => {
			try {
				const currentPassword = String((req.body && req.body.currentPassword) || "");
				const newPassword = String((req.body && req.body.newPassword) || "");
				if (!verifyAdminPassword(currentPassword)) {
					return res.status(401).json({ ok: false, error: "目前密碼錯誤" });
				}
				if (newPassword.length < 4) {
					return res.status(400).json({ ok: false, error: "新密碼至少 4 個字元" });
				}
				setAdminPassword(newPassword);
				res.json({ ok: true });
			} catch (err) {
				res.status(500).json({ ok: false, error: err.message });
			}
		});

		router.get("/api/env", requireAuth, (_req, res) => {
			try {
				const values = readEnvValues();
				if (!values.UNIFI_PROTECT_CAMERA_NAMES) {
					values.UNIFI_PROTECT_CAMERA_NAMES = cameraNamesFromEnv(values).join(",");
				}
				res.json({
					ok: true,
					path: ENV_PATH,
					fields: FIELD_META,
					values: publicEnvValues(values)
				});
			} catch (err) {
				res.status(500).json({ ok: false, error: err.message });
			}
		});

		router.post("/api/env", requireAuth, (req, res) => {
			try {
				const body = req.body && typeof req.body === "object" ? req.body : {};
				const updates = {};
				for (const field of FIELD_META) {
					if (Object.prototype.hasOwnProperty.call(body, field.key)) {
						updates[field.key] = body[field.key];
					}
				}
				for (const key of ADMIN_SECRET_KEYS) {
					delete updates[key];
				}
				expandCameraUpdates(updates);
				if (Object.keys(updates).length === 0) {
					return res.status(400).json({ ok: false, error: "沒有可儲存的欄位" });
				}
				writeEnvFile(ENV_PATH, updates);
				res.json({ ok: true, saved: Object.keys(updates).length });
			} catch (err) {
				res.status(500).json({ ok: false, error: err.message });
			}
		});

		router.post("/api/unifi/cameras", requireAuth, async (req, res) => {
			try {
				const body = req.body && typeof req.body === "object" ? req.body : {};
				const env = readEnvValues();
				const host = body.host || env.UNIFI_PROTECT_HOST;
				const username = body.username || env.UNIFI_PROTECT_USERNAME;
				const password = body.password || env.UNIFI_PROTECT_PASSWORD;
				const cameras = await listProtectCameras({ host, username, password });
				res.json({
					ok: true,
					cameras,
					selected: cameraNamesFromEnv({
						...env,
						UNIFI_PROTECT_CAMERA_NAMES: body.selectedNames || env.UNIFI_PROTECT_CAMERA_NAMES
					})
				});
			} catch (err) {
				res.status(500).json({ ok: false, error: err.message });
			}
		});

		router.post("/api/restart", requireAuth, (_req, res) => {
			res.json({ ok: true, message: "正在重啟 MagicMirror…" });
			// Restart from a detached shell after this process answers.
			// Calling `pm2 restart` directly from inside MagicMirror often fails.
			// Do not use --update-env: it can freeze stale camera vars into PM2 and
			// override config.env (Node loadEnvFile does not replace existing keys).
			setTimeout(() => {
				const child = spawn(
					"bash",
					["-c", "sleep 1; pm2 restart MagicMirror"],
					{
						detached: true,
						stdio: "ignore",
						env: process.env
					}
				);
				child.unref();
			}, 300);
		});

		router.use("/", express.static(PUBLIC_DIR));

		this.expressApp.use("/admin", router);
		console.log(`[${this.name}] Env editor → /admin (password protected)`);
	}
});
