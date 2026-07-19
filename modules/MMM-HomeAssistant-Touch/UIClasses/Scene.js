class Scene extends Base {
  getContainer() {
    const entity = super.getContainer();
    this._bindActivate(entity);
    return entity;
  }

  _bindActivate(entity) {
    entity.addEventListener(
      "pointerup",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.mm.sendSocketNotification("ACTIVATE_SCENE", { entity: this.id });
      },
      { passive: false }
    );
  }

  _iconClass() {
    const id = this.id || "";
    const name = this.name || "";
    if (id.includes("shui_jiao") || id.includes("shui_jue") || name.includes("睡覺")) {
      return "fas fa-bed";
    }
    if (id.includes("qi_chuang") || name.includes("起床")) {
      return "fas fa-sun";
    }
    return "fas fa-magic";
  }

  render() {
    const container = document.getElementById(this.id);
    if (!container) {
      return;
    }

    container.className = "";
    container.classList.add("ha-entity", "ha-scene", "ha-btn", "off");

    const icon = document.createElement("span");
    icon.className = "ha-icon";
    icon.innerHTML = `<i class="${this._iconClass()}"></i>`;

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = this.name;

    const status = document.createElement("span");
    status.className = "status";
    status.textContent = "執行";

    container.innerHTML = "";
    container.appendChild(icon);
    container.appendChild(title);
    container.appendChild(status);
  }
}
