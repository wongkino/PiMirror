/* MagicMirror² module: show this machine's LAN IPv4 on screen. */

"use strict";

Module.register("MMM-LocalIP", {
	defaults: {
		updateInterval: 5 * 60 * 1000,
		prefix: "IP "
	},

	start () {
		this.ip = null;
		this.getIp();
		setInterval(() => this.getIp(), this.config.updateInterval);
	},

	getIp () {
		this.sendSocketNotification("GET_LOCAL_IP");
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "small dimmed";
		wrapper.textContent = this.ip
			? `${this.config.prefix}${this.ip}`
			: `${this.config.prefix}…`;
		return wrapper;
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "LOCAL_IP" && payload !== this.ip) {
			this.ip = payload;
			this.updateDom();
		}
	}
});
