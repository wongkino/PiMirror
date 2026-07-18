/* MagicMirror² — hidden helper; UI is at /env-editor/ */

Module.register("MMM-EnvEditor", {
	defaults: {},

	getDom () {
		const el = document.createElement("div");
		el.style.display = "none";
		return el;
	}
});
