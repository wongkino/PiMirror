/* MagicMirror² — Player Focus: overlay on HA media player card (survives updateDom) */

"use strict";

Module.register("MMM-PlayerFocus", {
	defaults: {
		labelOn: "退出",
		labelOff: "全覽",
		// Wait this long after playback stops before powering off (avoid track gaps)
		screenOffDelay: 20 * 1000,
		brightnessMin: 10,
		brightnessMax: 100,
		brightnessDefault: 100
	},

	start () {
		this.focusOn = false;
		this.playing = false;
		this.hostEl = null;
		this.buttonEl = null;
		this.brightnessHost = null;
		this.brightnessSlider = null;
		this.brightnessValueEl = null;
		this.brightness = this.loadFocusBrightness();
		this._posTimer = null;
		this._screenOffTimer = null;
		this._observer = null;
		this.applyFocusBrightness(this.brightness);
	},

	getStyles () {
		return ["MMM-PlayerFocus.css", "font-awesome.css"];
	},

	getDom () {
		const placeholder = document.createElement("div");
		placeholder.className = "mmm-playerfocus-placeholder";
		return placeholder;
	},

	notificationReceived (notification, payload) {
		if (notification === "DOM_OBJECTS_CREATED") {
			this.ensureButton();
			this.ensureBrightnessControl();
			this.observePlayer();
			this.scheduleSync([300, 800, 1500]);
		} else if (notification === "NOWPLAYING_ACTIVE" || notification === "HA_MEDIA_ACTIVE") {
			const active = !!(payload && payload.active);
			this.onPlaybackActiveChange(active);
			this.scheduleSync([80, 250, 600, 1200]);
		} else if (notification === "PLAYER_FOCUS_SET") {
			const on = !!(payload && (payload.on === true || payload.to === true));
			this.setFocus(on);
		}
	},

	onPlaybackActiveChange (active) {
		const wasPlaying = this.playing;
		this.playing = active;

		if (active) {
			this.clearScreenOffTimer();
			return;
		}

		// Playback stopped while in player-focus → turn screen off after delay
		if (this.focusOn && wasPlaying) {
			this.clearScreenOffTimer();
			this._screenOffTimer = setTimeout(() => {
				this._screenOffTimer = null;
				if (this.playing || !this.focusOn) return;
				this.powerOffScreen();
			}, Math.max(0, Number(this.config.screenOffDelay) || 0));
		}
	},

	clearScreenOffTimer () {
		if (this._screenOffTimer) {
			clearTimeout(this._screenOffTimer);
			this._screenOffTimer = null;
		}
	},

	powerOffScreen () {
		this.setFocus(false);
		this.sendNotification("REMOTE_ACTION", { action: "MONITOROFF" });
	},

	scheduleSync (delays) {
		delays.forEach((ms) => setTimeout(() => this.syncVisibility(), ms));
	},

	getPlayerModule () {
		return (
			document.querySelector(".module.ha-media") ||
			document.querySelector(".module.MMM-HomeAssistant-Touch.ha-media")
		);
	},

	getCard (player) {
		if (!player) return null;
		return (
			player.querySelector(".ha-media-card.playing") ||
			player.querySelector(".ha-media-card:not(.ha-media-hidden)") ||
			null
		);
	},

	observePlayer () {
		if (this._observer) return;
		const player = this.getPlayerModule();
		if (!player) {
			setTimeout(() => this.observePlayer(), 1000);
			return;
		}
		this._observer = new MutationObserver(() => {
			this.syncVisibility();
		});
		this._observer.observe(player, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["class"]
		});
	},

	clampBrightness (value) {
		const min = Math.max(0, Number(this.config.brightnessMin) || 0);
		const max = Math.min(100, Number(this.config.brightnessMax) || 100);
		const n = Math.round(Number(value));
		if (!Number.isFinite(n)) return max;
		return Math.max(min, Math.min(max, n));
	},

	storageKey () {
		return "mmm-playerfocus-brightness";
	},

	loadFocusBrightness () {
		try {
			const raw = window.localStorage.getItem(this.storageKey());
			if (raw !== null) return this.clampBrightness(raw);
		} catch (e) {
			/* ignore */
		}
		return this.clampBrightness(this.config.brightnessDefault);
	},

	saveFocusBrightness (value) {
		try {
			window.localStorage.setItem(this.storageKey(), String(value));
		} catch (e) {
			/* ignore */
		}
	},

	/** Only dims 全覽 cover art — does not touch global Remote Control brightness. */
	applyFocusBrightness (value) {
		const next = this.clampBrightness(value);
		this.brightness = next;
		document.documentElement.style.setProperty(
			"--player-focus-brightness",
			String(next / 100)
		);
		this.refreshBrightnessUi();
	},

	ensureButton () {
		if (this.hostEl) return;
		this.hostEl = document.createElement("div");
		this.hostEl.className = "mmm-playerfocus-host is-hidden";

		this.buttonEl = document.createElement("button");
		this.buttonEl.type = "button";
		this.buttonEl.className = "mmm-playerfocus-btn";
		this.buttonEl.addEventListener("pointerup", (event) => {
			if (event.pointerType === "mouse" && event.button !== 0) return;
			event.preventDefault();
			event.stopPropagation();
			this.setFocus(!this.focusOn);
		});

		this.hostEl.appendChild(this.buttonEl);
		this.refreshButtonLabel();
	},

	ensureBrightnessControl () {
		if (this.brightnessHost) return;

		this.brightnessHost = document.createElement("div");
		this.brightnessHost.className = "mmm-playerfocus-brightness is-hidden";

		const label = document.createElement("div");
		label.className = "mmm-playerfocus-brightness-label";
		label.innerHTML = '<i class="fas fa-sun"></i><span>亮度</span>';

		this.brightnessValueEl = document.createElement("span");
		this.brightnessValueEl.className = "mmm-playerfocus-brightness-value";

		const labelRight = document.createElement("div");
		labelRight.className = "mmm-playerfocus-brightness-meta";
		labelRight.appendChild(this.brightnessValueEl);

		const header = document.createElement("div");
		header.className = "mmm-playerfocus-brightness-header";
		header.appendChild(label);
		header.appendChild(labelRight);

		this.brightnessSlider = document.createElement("input");
		this.brightnessSlider.type = "range";
		this.brightnessSlider.className = "mmm-playerfocus-brightness-slider";
		this.brightnessSlider.min = String(Math.max(0, Number(this.config.brightnessMin) || 0));
		this.brightnessSlider.max = String(Math.min(100, Number(this.config.brightnessMax) || 100));
		this.brightnessSlider.step = "1";
		this.brightnessSlider.value = String(this.brightness);
		this.brightnessSlider.setAttribute("aria-label", "全覽亮度");

		const stopSwipe = (event) => {
			event.stopPropagation();
		};
		this.brightnessSlider.addEventListener("pointerdown", stopSwipe);
		this.brightnessSlider.addEventListener("touchstart", stopSwipe, { passive: true });
		this.brightnessSlider.addEventListener("input", () => {
			this.applyFocusBrightness(this.brightnessSlider.value);
		});
		this.brightnessSlider.addEventListener("change", () => {
			this.applyFocusBrightness(this.brightnessSlider.value);
			this.saveFocusBrightness(this.brightness);
		});

		this.brightnessHost.appendChild(header);
		this.brightnessHost.appendChild(this.brightnessSlider);
		document.body.appendChild(this.brightnessHost);
		this.refreshBrightnessUi();
	},

	refreshBrightnessUi () {
		if (this.brightnessSlider && String(this.brightnessSlider.value) !== String(this.brightness)) {
			this.brightnessSlider.value = String(this.brightness);
		}
		if (this.brightnessValueEl) {
			this.brightnessValueEl.textContent = `${this.brightness}%`;
		}
	},

	/**
	 * Attach to the module shell (NOT .module-content) so MagiMirror
	 * updateDom/fade does not destroy the button.
	 */
	syncVisibility () {
		const player = this.getPlayerModule();
		if (!player) return;

		this.ensureButton();
		this.ensureBrightnessControl();
		if (this.hostEl.parentElement !== player) {
			player.appendChild(this.hostEl);
		}

		const card = this.getCard(player);
		const playing = !!card;
		// Don't clobber playing flag from notifications mid-debounce;
		// only use DOM as a fallback when notifications haven't set it yet.
		if (playing) {
			this.playing = true;
			this.clearScreenOffTimer();
		} else if (!this.focusOn) {
			this.playing = false;
		}

		const show = this.playing || this.focusOn || playing;

		this.hostEl.classList.toggle("is-hidden", !show);
		this.brightnessHost.classList.toggle("is-hidden", !this.focusOn);
		this.refreshButtonLabel();

		if (show && card) {
			this.positionOverCard(player, card);
		} else if (show) {
			this.hostEl.style.top = "8px";
			this.hostEl.style.right = "8px";
			this.hostEl.style.left = "auto";
			this.hostEl.style.bottom = "auto";
		}
	},

	positionOverCard (player, card) {
		const pr = player.getBoundingClientRect();
		const cr = card.getBoundingClientRect();
		if (!pr.width || !cr.width) return;

		const top = Math.max(0, cr.top - pr.top + 8);
		const right = Math.max(0, pr.right - cr.right + 8);

		this.hostEl.style.top = `${top}px`;
		this.hostEl.style.right = `${right}px`;
		this.hostEl.style.left = "auto";
		this.hostEl.style.bottom = "auto";
	},

	refreshButtonLabel () {
		if (!this.buttonEl) return;
		const label = this.focusOn ? this.config.labelOn : this.config.labelOff;
		if (this.buttonEl.textContent !== label) this.buttonEl.textContent = label;
		this.buttonEl.classList.toggle("is-on", this.focusOn);
		this.buttonEl.setAttribute("aria-pressed", this.focusOn ? "true" : "false");
		this.buttonEl.title = this.focusOn ? "顯示全部模組" : "只顯示播放器";
	},

	setFocus (on) {
		if (this.focusOn === on) return;
		this.focusOn = on;
		if (!on) this.clearScreenOffTimer();
		document.body.classList.toggle("player-focus", on);
		if (on) {
			this.applyFocusBrightness(this.brightness);
		}
		this.syncVisibility();
		this.sendNotification("PLAYER_FOCUS_STATUS", {
			type: "internal",
			on
		});
	}
});
