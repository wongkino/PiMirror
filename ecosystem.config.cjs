/** PM2 — boot PiMirrorKiosk (dashboard API + Electron). */
const path = require("node:path");

const root = __dirname;

module.exports = {
	apps: [
		{
			name: "PiMirrorKiosk",
			script: "scripts/start-kiosk.sh",
			cwd: root,
			interpreter: "bash",
			autorestart: true,
			max_restarts: 20,
			restart_delay: 5000,
			env: {
				WAYLAND_DISPLAY: "wayland-0",
				DISPLAY: ":0",
				XDG_RUNTIME_DIR: `/run/user/${process.getuid()}`,
				DASHBOARD_PORT: "8090"
			}
		}
	]
};
