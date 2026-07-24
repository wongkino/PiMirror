"use strict";

const NodeHelper = require("node_helper");
const Log = require("logger");

const API = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php";

module.exports = NodeHelper.create({
	start () {
		this.timer = null;
		this.config = null;
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "HKO_SWT_FETCH") return;
		this.config = payload || {};
		this.fetchWarnings();
		this.clearTimer();
		const interval = Math.max(60 * 1000, Number(this.config.updateInterval) || 5 * 60 * 1000);
		this.timer = setInterval(() => this.fetchWarnings(), interval);
	},

	clearTimer () {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	},

	async fetchWarnings () {
		const lang = this.config?.lang || "tc";
		const url = `${API}?dataType=warnsum&lang=${encodeURIComponent(lang)}`;
		try {
			const response = await fetch(url, {
				headers: { "Cache-Control": "no-cache" },
				signal: AbortSignal.timeout(15000)
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const data = await response.json();
			const tips = [];
			for (const entry of Object.values(data || {})) {
				if (!entry || typeof entry !== "object") continue;
				const action = `${entry.actionCode || ""}`.toUpperCase();
				if (action === "CANCEL") continue;
				const name = `${entry.name || ""}`.trim();
				if (name) tips.push(name);
			}
			this.sendSocketNotification("HKO_SWT_DATA", { tips });
		} catch (error) {
			Log.error(`[MMM-HKO-SpecialTips] warnsum fetch failed: ${error.message}`);
			this.sendSocketNotification("HKO_SWT_DATA", { tips: [] });
		}
	},

	stop () {
		this.clearTimer();
	}
});
