/* MagicMirror² — swipe anywhere to change MMM-pages */

"use strict";

Module.register("MMM-PageSwipe", {
	defaults: {
		// Portrait strip: vertical swipe is primary; horizontal also works
		minDistance: 70,
		maxTime: 900,
		// Ignore swipes that start on these selectors (controls / dots)
		ignoreSelector:
			"button, a, input, .indicator, .circle-wrapper, .mmm-unifiprotect-native-live, video, iframe"
	},

	start () {
		this.startX = 0;
		this.startY = 0;
		this.startT = 0;
		this.tracking = false;
	},

	notificationReceived (notification) {
		if (notification === "DOM_OBJECTS_CREATED") {
			this.bindSwipe();
		}
	},

	bindSwipe () {
		const onStart = (event) => {
			if (this.shouldIgnore(event.target)) return;
			const point = this.pointFrom(event);
			if (!point) return;
			this.tracking = true;
			this.startX = point.x;
			this.startY = point.y;
			this.startT = Date.now();
		};

		const onEnd = (event) => {
			if (!this.tracking) return;
			this.tracking = false;
			const point = this.pointFrom(event);
			if (!point) return;
			const dx = point.x - this.startX;
			const dy = point.y - this.startY;
			const dt = Date.now() - this.startT;
			if (dt > this.config.maxTime) return;

			const absX = Math.abs(dx);
			const absY = Math.abs(dy);
			const min = this.config.minDistance;

			if (absY >= absX && absY >= min) {
				// Swipe up → next page; swipe down → previous
				this.sendNotification(dy < 0 ? "PAGE_INCREMENT" : "PAGE_DECREMENT");
			} else if (absX >= min) {
				// Swipe left → next; swipe right → previous
				this.sendNotification(dx < 0 ? "PAGE_INCREMENT" : "PAGE_DECREMENT");
			}
		};

		const onCancel = () => {
			this.tracking = false;
		};

		document.addEventListener("touchstart", onStart, { passive: true, capture: true });
		document.addEventListener("touchend", onEnd, { passive: true, capture: true });
		document.addEventListener("touchcancel", onCancel, { passive: true, capture: true });

		// Some Waveshare panels emit pointer/mouse instead of touch
		document.addEventListener("pointerdown", (event) => {
			if (event.pointerType === "mouse" && event.button !== 0) return;
			onStart(event);
		}, { passive: true, capture: true });
		document.addEventListener("pointerup", onEnd, { passive: true, capture: true });
		document.addEventListener("pointercancel", onCancel, { passive: true, capture: true });
	},

	shouldIgnore (target) {
		if (!target || !target.closest) return false;
		return Boolean(target.closest(this.config.ignoreSelector));
	},

	pointFrom (event) {
		if (event.changedTouches && event.changedTouches[0]) {
			return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
		}
		if (event.touches && event.touches[0]) {
			return { x: event.touches[0].clientX, y: event.touches[0].clientY };
		}
		if (typeof event.clientX === "number") {
			return { x: event.clientX, y: event.clientY };
		}
		return null;
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.style.display = "none";
		return wrapper;
	}
});
