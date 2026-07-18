/* MagicMirror² — Player Focus: overlay on NowPlaying card (survives updateDom) */

"use strict";

Module.register("MMM-PlayerFocus", {
	defaults: {
		labelOn: "播放",
		labelOff: "全覽",
		// Wait this long after playback stops before powering off (avoid track gaps)
		screenOffDelay: 20 * 1000
	},

	start () {
		this.focusOn = false;
		this.playing = false;
		this.hostEl = null;
		this.buttonEl = null;
		this._posTimer = null;
		this._screenOffTimer = null;
	},

	getStyles () {
		return ["MMM-PlayerFocus.css"];
	},

	getDom () {
		const placeholder = document.createElement("div");
		placeholder.className = "mmm-playerfocus-placeholder";
		return placeholder;
	},

	notificationReceived (notification, payload) {
		if (notification === "DOM_OBJECTS_CREATED") {
			this.ensureButton();
			this.scheduleSync([300, 800, 1500]);
		} else if (notification === "NOWPLAYING_ACTIVE") {
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
		return document.querySelector(".module.MMM-NowPlaying");
	},

	getCard (player) {
		if (!player) return null;
		return (
			player.querySelector(".nowplaying-card") ||
			player.querySelector(".nowplaying-list") ||
			null
		);
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

	/**
	 * Attach to the module shell (NOT .module-content) so MagiMirror
	 * updateDom/fade does not destroy the button.
	 */
	syncVisibility () {
		const player = this.getPlayerModule();
		if (!player) return;

		this.ensureButton();
		if (this.hostEl.parentElement !== player) {
			player.appendChild(this.hostEl);
		}

		const card = this.getCard(player);
		const playing = !!card;
		// Don't clobber playing flag from NOWPLAYING_ACTIVE mid-debounce;
		// only use DOM as a fallback when notifications haven't set it yet.
		if (playing) {
			this.playing = true;
			this.clearScreenOffTimer();
		}

		const show = this.playing || this.focusOn || playing;

		this.hostEl.classList.toggle("is-hidden", !show);
		this.refreshButtonLabel();

		if (show && card) {
			this.positionOverCard(player, card);
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
		this.syncVisibility();
		this.sendNotification("PLAYER_FOCUS_STATUS", {
			type: "internal",
			on
		});
	}
});
