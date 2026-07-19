class Climate extends Base {
  updateState(state) {
    this.hassState = state;
    this.state = state.state;
    const attrs = state.attributes || {};
    this.name = attrs.friendly_name || this.id;
    this.currentTemp = attrs.current_temperature;
    this.targetTemp = attrs.temperature;
    this.minTemp = Number(attrs.min_temp ?? 16);
    this.maxTemp = Number(attrs.max_temp ?? 30);
    this.hvacModes = attrs.hvac_modes || ["off", "cool", "heat"];
    this.render();
  }

  _bind(el, fn) {
    el.addEventListener(
      "pointerup",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      },
      { passive: false }
    );
  }

  _btn(label, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ha-climate-btn" + (cls ? ` ${cls}` : "");
    b.textContent = label;
    return b;
  }

  _preferredOnMode() {
    if (this.hvacModes.includes("cool")) return "cool";
    if (this.hvacModes.includes("heat")) return "heat";
    return this.hvacModes.find((m) => m !== "off") || "cool";
  }

  _modeLabel() {
    const map = {
      off: "關",
      cool: "冷氣",
      heat: "暖風",
      heat_cool: "自動",
      dry: "抽濕",
      fan_only: "送風",
    };
    return map[this.state] || this.state;
  }

  render() {
    const container = document.getElementById(this.id);
    if (!container || !this.hassState) return;

    const isOn = this.state && this.state !== "off";
    container.className = "";
    container.classList.add(
      "ha-entity",
      "ha-climate",
      "ha-climate-card",
      isOn ? "on" : "off"
    );

    const head = document.createElement("div");
    head.className = "ha-climate-head";

    const title = document.createElement("div");
    title.className = "ha-climate-title";
    title.textContent = this.name;

    const mode = document.createElement("div");
    mode.className = "ha-climate-mode";
    mode.textContent = this._modeLabel();

    head.appendChild(title);
    head.appendChild(mode);

    const temps = document.createElement("div");
    temps.className = "ha-climate-temps";

    const cur = document.createElement("div");
    cur.className = "ha-climate-current";
    cur.innerHTML = `<span class="num">${
      this.currentTemp != null ? this.currentTemp : "--"
    }</span><span class="unit">°C 室溫</span>`;

    const tgt = document.createElement("div");
    tgt.className = "ha-climate-target";
    tgt.innerHTML = `<span class="num">${
      this.targetTemp != null ? this.targetTemp : "--"
    }</span><span class="unit">°C 設定</span>`;

    temps.appendChild(cur);
    temps.appendChild(tgt);

    const controls = document.createElement("div");
    controls.className = "ha-climate-controls";

    const power = this._btn(isOn ? "關閉" : "開啟", "ha-climate-power");
    this._bind(power, () => {
      this.mm.sendSocketNotification("CLIMATE_SET_HVAC", {
        entity: this.id,
        hvac_mode: isOn ? "off" : this._preferredOnMode(),
      });
    });

    const minus = this._btn("−", "ha-climate-step");
    this._bind(minus, () => {
      if (this.targetTemp == null) return;
      const next = Math.max(this.minTemp, Number(this.targetTemp) - 1);
      this.mm.sendSocketNotification("CLIMATE_SET_TEMPERATURE", {
        entity: this.id,
        temperature: next,
      });
    });

    const plus = this._btn("+", "ha-climate-step");
    this._bind(plus, () => {
      if (this.targetTemp == null) return;
      const next = Math.min(this.maxTemp, Number(this.targetTemp) + 1);
      this.mm.sendSocketNotification("CLIMATE_SET_TEMPERATURE", {
        entity: this.id,
        temperature: next,
      });
    });

    controls.appendChild(minus);
    controls.appendChild(power);
    controls.appendChild(plus);

    container.innerHTML = "";
    container.appendChild(head);
    container.appendChild(temps);
    container.appendChild(controls);
  }
}
