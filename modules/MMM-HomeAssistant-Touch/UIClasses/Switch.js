class Switch extends Base {
  getContainer() {
    const entity = super.getContainer();
    this._bindToggle(entity);
    return entity;
  }

  _bindToggle(entity) {
    // Single pointer handler avoids double toggle (click + touchend) on Waveshare
    entity.addEventListener(
      "pointerup",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.mm.sendSocketNotification("TOGGLE_STATE", { entity: this.id });
      },
      { passive: false }
    );
  }

  _iconClass() {
    const id = this.id || "";
    const name = this.name || "";
    if (id.includes("feng_shan") || name.includes("風扇")) {
      return "fas fa-fan";
    }
    if (id.includes("04018130496") || name.includes("蚊香")) {
      return "fas fa-bug";
    }
    return "fas fa-power-off";
  }

  render() {
    const container = document.getElementById(this.id);
    if (!container) {
      return;
    }

    const isOn = this.state === "on";
    container.className = "";
    container.classList.add("ha-entity", "ha-switch", "ha-btn", isOn ? "on" : "off");

    const icon = document.createElement("span");
    icon.className = "ha-icon";
    icon.innerHTML = `<i class="${this._iconClass()}"></i>`;

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = this.name;

    const status = document.createElement("span");
    status.className = "status";
    status.textContent = isOn ? "開" : "關";

    container.innerHTML = "";
    container.appendChild(icon);
    container.appendChild(title);
    container.appendChild(status);
  }
}
