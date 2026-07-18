const NodeHelper = require("node_helper");
const path = require("path");
const fs = require("fs");

module.exports = NodeHelper.create({
	start () {
		this.started = false;
		this.refreshTimer = null;
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "START_SONARR") return;

		this.config = payload || {};
		this.config.baseUrl = String(this.config.baseUrl || "").replace(/\/+$/, "");
		this.config.apiKey = String(this.config.apiKey || "").trim();

		if (!this.config.baseUrl || !this.config.apiKey) {
			console.error(`${this.name}: missing baseUrl or apiKey`);
			return;
		}

		console.log(`${this.name}: starting`, {
			baseUrl: this.config.baseUrl,
			apiKeyLen: this.config.apiKey.length,
			language: this.config.language
		});

		this.started = true;
		this.loadTranslationFile();
		this.refreshAll();
		this.scheduleRefresh();
	},

	loadTranslationFile () {
		try {
			const filePath = path.join(__dirname, "translations", `${this.config.language || "en"}.json`);
			if (!fs.existsSync(filePath)) {
				throw new Error(`missing ${filePath}`);
			}
			const translation = JSON.parse(fs.readFileSync(filePath, "utf8"));
			this.sendSocketNotification("SONARR_TRANSLATION", translation);
		} catch (err) {
			console.error(`${this.name}: translation fallback:`, err.message);
			this.sendSocketNotification("SONARR_TRANSLATION", {
				upcoming: "即將播出",
				recent: "最近下載"
			});
		}
	},

	scheduleRefresh () {
		if (this.refreshTimer) clearInterval(this.refreshTimer);
		const interval = Math.max(60 * 1000, Number(this.config.updateInterval) || 5 * 60 * 1000);
		this.refreshTimer = setInterval(() => this.refreshAll(), interval);
	},

	refreshAll () {
		this.getUpcoming();
		this.getHistory();
	},

	async getUpcoming () {
		const start = new Date();
		const end = new Date(start.getTime() + 24 * 24 * 60 * 60 * 1000);
		const params = new URLSearchParams({
			start: start.toISOString(),
			end: end.toISOString(),
			includeSeries: "true",
			includeEpisodeFile: "false"
		});
		const data = await this.sendRequest(`/api/v3/calendar?${params}`);
		if (!Array.isArray(data)) {
			console.error(`${this.name}: calendar response not array`);
			return;
		}
		this.sendSocketNotification("SONARR_UPCOMING", data);
	},

	async getHistory () {
		const params = new URLSearchParams({
			page: "1",
			pageSize: "50",
			sortKey: "date",
			sortDirection: "descending",
			includeSeries: "true",
			includeEpisode: "true",
			eventType: "1"
		});
		const data = await this.sendRequest(`/api/v3/history?${params}`);
		if (data && Array.isArray(data.records)) {
			this.sendSocketNotification("SONARR_HISTORY", data.records);
		} else {
			console.error(`${this.name}: invalid history response`);
		}
	},

	async sendRequest (apiPath) {
		const fullUrl = `${this.config.baseUrl}${apiPath}`;
		const shortPath = apiPath.split("?")[0];
		console.log(`${this.name}: fetching ${shortPath}`);
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 20000);
			const response = await fetch(fullUrl, {
				headers: {
					"X-Api-Key": this.config.apiKey,
					Accept: "application/json",
					"User-Agent": "MagicMirror-MMM-Sonarr"
				},
				signal: controller.signal
			});
			clearTimeout(timer);
			const text = await response.text();
			if (!response.ok) {
				console.error(`${this.name}: HTTP ${response.status} for ${shortPath} body=${text.slice(0, 120)}`);
				return null;
			}
			if (!text) {
				console.error(`${this.name}: empty body for ${shortPath}`);
				return null;
			}
			const data = JSON.parse(text);
			const count = Array.isArray(data) ? data.length : (data.records ? data.records.length : "?");
			console.log(`${this.name}: ok ${shortPath} items=${count}`);
			return data;
		} catch (error) {
			console.error(`${this.name}: request failed ${shortPath}:`, error.message);
			return null;
		}
	}
});
