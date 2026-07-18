"use strict";

const os = require("node:os");
const NodeHelper = require("node_helper");

function pickLanIPv4 () {
	const nets = os.networkInterfaces();
	const preferred = ["eth0", "en0", "wlan0", "wlan1", "enp", "end"];
	const candidates = [];

	for (const [name, addrs] of Object.entries(nets)) {
		if (!addrs) continue;
		for (const addr of addrs) {
			const family = addr.family === 4 || addr.family === "IPv4";
			if (!family || addr.internal) continue;
			candidates.push({ name, address: addr.address });
		}
	}

	for (const prefix of preferred) {
		const hit = candidates.find((c) => c.name === prefix || c.name.startsWith(prefix));
		if (hit) return hit.address;
	}

	return candidates[0]?.address || "—";
}

module.exports = NodeHelper.create({
	socketNotificationReceived (notification) {
		if (notification === "GET_LOCAL_IP") {
			this.sendSocketNotification("LOCAL_IP", pickLanIPv4());
		}
	}
});
