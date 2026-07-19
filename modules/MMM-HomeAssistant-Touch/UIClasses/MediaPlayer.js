class MediaPlayer extends Base {
  updateState(state) {
    this.hassState = state;
    this.state = state.state;
    const attrs = state.attributes || {};
    this.title = attrs.media_title || attrs.friendly_name || this.id;
    this.artist = attrs.media_artist || "";
    this.album = attrs.media_album_name || "";
    this.app = attrs.app_name || attrs.source || "";
    this.name = attrs.friendly_name || this.id;
    this.picture =
      attrs.resolved_art_url ||
      (typeof attrs.entity_picture === "string" &&
      /^https?:\/\//i.test(attrs.entity_picture)
        ? attrs.entity_picture
        : "");
    this.render();
    this._notifyActive();
  }

  _notifyActive() {
    const active = this.state === "playing" || this.state === "paused";
    if (this._lastActive === active) return;
    this._lastActive = active;
    this.mm.sendNotification("HA_MEDIA_ACTIVE", { active, entity: this.id });
  }

  _bindControl(el, notification) {
    el.addEventListener(
      "pointerup",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.mm.sendSocketNotification(notification, { entity: this.id });
      },
      { passive: false }
    );
  }

  getControls() {
    const controlDiv = document.createElement("div");
    controlDiv.classList.add("media_player_control", "ha-media-controls");

    const previous = this.getButton("step-backward");
    this._bindControl(previous, "MEDIA_PLAYER_PREVIOUS");
    controlDiv.appendChild(previous);

    const playPause = this.getButton(
      this.state === "playing" ? "pause" : "play",
      true
    );
    this._bindControl(playPause, "MEDIA_PLAYER_PLAYPAUSE");
    controlDiv.appendChild(playPause);

    const next = this.getButton("step-forward");
    this._bindControl(next, "MEDIA_PLAYER_NEXT");
    controlDiv.appendChild(next);

    return controlDiv;
  }

  getButton(icon, primary) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ha-media-btn" + (primary ? " ha-media-btn-primary" : "");
    button.innerHTML = `<i class="fas fa-${icon}"></i>`;
    return button;
  }

  _formatTime(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  _getProgress() {
    const attrs = (this.hassState && this.hassState.attributes) || {};
    let pos = Number(attrs.media_position);
    let dur = Number(attrs.media_duration);
    if (!Number.isFinite(pos) || pos < 0) pos = 0;
    if (!Number.isFinite(dur) || dur <= 0) {
      return { pos: 0, dur: 0, pct: 0 };
    }
    const updated = attrs.media_position_updated_at;
    if (this.state === "playing" && updated) {
      const delta = (Date.now() - new Date(updated).getTime()) / 1000;
      if (Number.isFinite(delta) && delta > 0) pos += delta;
    }
    pos = Math.min(pos, dur);
    return { pos, dur, pct: Math.min(100, (pos / dur) * 100) };
  }

  _stopProgressTicker() {
    if (this._progressTimer) {
      clearInterval(this._progressTimer);
      this._progressTimer = null;
    }
  }

  _startProgressTicker() {
    this._stopProgressTicker();
    if (this.state !== "playing") return;
    const attrs = (this.hassState && this.hassState.attributes) || {};
    if (!(Number(attrs.media_duration) > 0)) return;
    this._progressTimer = setInterval(() => this._updateProgressDom(), 500);
  }

  _updateProgressDom() {
    if (!this._progressFill || !this._progressElapsed) return;
    const { pos, dur, pct } = this._getProgress();
    if (!(dur > 0)) {
      if (this._progressRoot) this._progressRoot.classList.add("ha-media-hidden");
      this._stopProgressTicker();
      return;
    }
    this._progressRoot.classList.remove("ha-media-hidden");
    this._progressFill.style.width = `${pct}%`;
    this._progressElapsed.textContent = this._formatTime(pos);
    if (this._progressDuration) {
      this._progressDuration.textContent = this._formatTime(dur);
    }
  }

  getProgressBar() {
    const root = document.createElement("div");
    root.className = "ha-media-progress";

    const track = document.createElement("div");
    track.className = "ha-media-progress-track";
    const fill = document.createElement("div");
    fill.className = "ha-media-progress-fill";
    track.appendChild(fill);

    const times = document.createElement("div");
    times.className = "ha-media-progress-times";
    const elapsed = document.createElement("span");
    elapsed.className = "ha-media-progress-elapsed";
    const duration = document.createElement("span");
    duration.className = "ha-media-progress-duration";
    times.appendChild(elapsed);
    times.appendChild(duration);

    root.appendChild(track);
    root.appendChild(times);

    this._progressRoot = root;
    this._progressFill = fill;
    this._progressElapsed = elapsed;
    this._progressDuration = duration;

    const { dur } = this._getProgress();
    if (!(dur > 0)) {
      root.classList.add("ha-media-hidden");
    } else {
      this._updateProgressDom();
    }

    return root;
  }

  render() {
    const container = document.getElementById(this.id);
    if (!container || !this.hassState) {
      return;
    }

    this._stopProgressTicker();

    const playing = this.state === "playing";
    const show = playing || this.state === "paused";

    container.className = "";
    container.classList.add(
      "ha-entity",
      "ha-media_player",
      "ha-media-card",
      playing ? "playing" : "paused"
    );
    if (!show) {
      container.classList.add("ha-media-hidden");
    } else {
      container.classList.remove("ha-media-hidden");
    }

    // Full-bleed art (NowPlaying style)
    const artWrap = document.createElement("div");
    artWrap.className = "ha-media-art-wrap";
    if (this.picture) {
      const img = document.createElement("img");
      img.className = "ha-media-art-img";
      img.alt = "";
      img.src = this.picture;
      img.referrerPolicy = "no-referrer";
      artWrap.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "ha-media-art-placeholder";
      ph.innerHTML = '<i class="fas fa-music"></i>';
      artWrap.appendChild(ph);
    }

    const overlay = document.createElement("div");
    overlay.className = "ha-media-art-overlay";

    const body = document.createElement("div");
    body.className = "ha-media-card-body";

    const device = document.createElement("div");
    device.className = "ha-media-device-label";
    device.textContent = this.name;

    const title = document.createElement("div");
    title.className = "ha-media-title";
    title.textContent = this.title || this.name;

    const subParts = [this.artist];
    if (this.album) subParts.push(this.album);
    const subText = subParts.filter(Boolean).join("  ·  ");
    const sub = document.createElement("div");
    sub.className = "ha-media-sub";
    sub.textContent = subText || this.app || (playing ? "播放中" : "已暫停");

    body.appendChild(device);
    body.appendChild(title);
    body.appendChild(sub);
    body.appendChild(this.getProgressBar());
    body.appendChild(this.getControls());

    container.innerHTML = "";
    container.style.backgroundImage = "";
    container.appendChild(artWrap);
    container.appendChild(overlay);
    container.appendChild(body);

    if (show) this._startProgressTicker();
  }
}
