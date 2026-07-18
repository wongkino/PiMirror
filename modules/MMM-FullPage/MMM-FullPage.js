Module.register("MMM-FullPage", {
	defaults: {
		url: "https://hk-toolkit.com",
		refreshInterval: 0 // minutes; 0 = no auto-refresh
	},

	getStyles () {
		return ["MMM-FullPage.css"];
	},

	start () {
		if (this.config.refreshInterval > 0) {
			setInterval(() => {
				this.updateDom(0);
			}, this.config.refreshInterval * 60 * 1000);
		}
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-fullpage";

		const iframe = document.createElement("iframe");
		iframe.src = this.config.url;
		iframe.setAttribute("frameborder", "0");
		iframe.setAttribute("allowfullscreen", "true");
		iframe.setAttribute("allow", "autoplay; fullscreen; geolocation");
		wrapper.appendChild(iframe);

		return wrapper;
	}
});
