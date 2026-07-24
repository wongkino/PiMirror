/* MagicMirror² — HKO Warning Signals (天氣警告信號 / warnsum) */

"use strict";

Module.register("MMM-HKO-SpecialTips", {
	defaults: {
		updateInterval: 60 * 1000,
		lang: "tc",
		maxTips: 5,
		header: "",
		hideWhenEmpty: true
	},

	start () {
		this.tips = [];
		this.loaded = false;
		if (this.config.hideWhenEmpty) {
			this.hide(0);
		}
		this.scheduleFetch();
	},

	scheduleFetch () {
		this.sendSocketNotification("HKO_SWT_FETCH", {
			lang: this.config.lang,
			updateInterval: this.config.updateInterval
		});
	},

	getStyles () {
		return ["MMM-HKO-SpecialTips.css"];
	},

	getHeader () {
		if (!this.tips.length) return "";
		return this.config.header;
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-hko-swt";

		if (!this.loaded) {
			wrapper.className += " dimmed xsmall";
			wrapper.textContent = "…";
			return wrapper;
		}

		if (!this.tips.length) {
			wrapper.className += " empty";
			return wrapper;
		}

		const list = document.createElement("div");
		list.className = "mmm-hko-swt-list xsmall";

		this.tips.slice(0, this.config.maxTips).forEach((tip) => {
			const item = document.createElement("div");
			item.className = "mmm-hko-swt-item";
			const text = document.createElement("div");
			text.className = "mmm-hko-swt-text";
			text.textContent = tip;
			item.appendChild(text);
			list.appendChild(item);
		});

		wrapper.appendChild(list);
		return wrapper;
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "HKO_SWT_DATA") return;

		this.loaded = true;
		this.tips = Array.isArray(payload?.tips) ? payload.tips : [];

		if (this.config.hideWhenEmpty) {
			if (this.tips.length) {
				this.show(0);
			} else {
				this.hide(0);
			}
		}

		this.updateDom(300);
	}
});
