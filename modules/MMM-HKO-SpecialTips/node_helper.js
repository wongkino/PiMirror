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
		this.fetchTips();
		this.clearTimer();
		const interval = Math.max(60 * 1000, Number(this.config.updateInterval) || 5 * 60 * 1000);
		this.timer = setInterval(() => this.fetchTips(), interval);
	},

	clearTimer () {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	},

	async fetchTips () {
		const lang = this.config?.lang || "tc";
		const url = `${API}?dataType=swt&lang=${encodeURIComponent(lang)}`;
		try {
			const response = await fetch(url, {
				headers: { "Cache-Control": "no-cache" },
				signal: AbortSignal.timeout(15000)
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const data = await response.json();
			const tips = (Array.isArray(data?.swt) ? data.swt : [])
				.map((entry) => `${entry?.desc || ""}`.trim())
				.filter(Boolean);
			this.sendSocketNotification("HKO_SWT_DATA", { tips });
		} catch (error) {
			Log.error(`[MMM-HKO-SpecialTips] fetch failed: ${error.message}`);
			this.sendSocketNotification("HKO_SWT_DATA", { tips: [] });
		}
	},

	stop () {
		this.clearTimer();
	}
});
