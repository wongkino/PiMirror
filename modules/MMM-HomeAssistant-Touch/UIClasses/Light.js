class Light extends Base {
  updateState(state) {
    this.hassState = state;
    this.state = state.state;
    const attrs = state.attributes || {};
    this.name = attrs.friendly_name || this.id;
    this.brightness =
      typeof attrs.brightness === "number"
        ? Math.round((attrs.brightness / 255) * 100)
        : null;
    this.hasBrightness = typeof attrs.brightness === "number" || this.state === "off";
    // Only show slider when device supports brightness (supported_color_modes / features)
    const modes = attrs.supported_color_modes || [];
    this.supportsBrightness =
      this.brightness != null ||
      modes.includes("brightness") ||
      modes.includes("color_temp") ||
      modes.includes("hs") ||
      modes.includes("xy") ||
      modes.includes("rgb");
    this.render();
  }

  getContainer() {
    const entity = super.getContainer();
    return entity;
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

  _iconClass() {
    if (
      this.id.includes("wall_switch") ||
      (this.name && this.name.includes("燈製"))
    ) {
      return "fas fa-toggle-on";
    }
    return "fas fa-lightbulb";
  }

  render() {
    const container = document.getElementById(this.id);
    if (!container) return;

    const isOn = this.state === "on";
    container.className = "";
    container.classList.add(
      "ha-entity",
      "ha-light",
      "ha-btn",
      isOn ? "on" : "off"
    );
    if (this.supportsBrightness) {
      container.classList.add("ha-light-dimmable");
    }

    const top = document.createElement("div");
    top.className = "ha-light-top";

    const icon = document.createElement("span");
    icon.className = "ha-icon";
    icon.innerHTML = `<i class="${this._iconClass()}"></i>`;
    this._bind(icon, () => {
      this.mm.sendSocketNotification("TOGGLE_STATE", { entity: this.id });
    });

    const meta = document.createElement("div");
    meta.className = "ha-light-meta";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = this.name;

    const status = document.createElement("span");
    status.className = "status";
    if (isOn && this.brightness != null) {
      status.textContent = `${this.brightness}%`;
    } else {
      status.textContent = isOn ? "開" : "關";
    }

    meta.appendChild(title);
    meta.appendChild(status);
    top.appendChild(icon);
    top.appendChild(meta);

    container.innerHTML = "";
    container.appendChild(top);

    if (this.supportsBrightness) {
      const row = document.createElement("div");
      row.className = "ha-brightness-row";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "1";
      slider.max = "100";
      slider.step = "1";
      slider.value = String(isOn && this.brightness != null ? this.brightness : 50);
      slider.className = "ha-brightness-slider";
      slider.disabled = false;

      const apply = () => {
        const pct = Number(slider.value);
        this.mm.sendSocketNotification("SET_LIGHT_BRIGHTNESS", {
          entity: this.id,
          brightness_pct: pct,
        });
      };

      slider.addEventListener("pointerup", (e) => {
        e.stopPropagation();
        apply();
      });
      slider.addEventListener("change", (e) => {
        e.stopPropagation();
        apply();
      });
      // Prevent page swipe while dragging
      slider.addEventListener("pointerdown", (e) => e.stopPropagation());
      slider.addEventListener("touchstart", (e) => e.stopPropagation(), {
        passive: true,
      });

      row.appendChild(slider);
      container.appendChild(row);
    } else {
      // Whole card toggles for non-dimmable lights
      this._bind(container, () => {
        this.mm.sendSocketNotification("TOGGLE_STATE", { entity: this.id });
      });
    }
  }
}
