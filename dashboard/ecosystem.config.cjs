/** PM2: boot with PiMirrorKiosk only (dashboard server + Electron kiosk). */
module.exports = {
	apps: [
		{
			name: "PiMirrorKiosk",
			script: "dashboard/start-kiosk.sh",
			cwd: "/home/wongkino/MagicMirror",
			interpreter: "bash",
			autorestart: true,
			max_restarts: 20,
			restart_delay: 5000,
			env: {
				WAYLAND_DISPLAY: "wayland-0",
				DISPLAY: ":0",
				XDG_RUNTIME_DIR: "/run/user/1000",
				DASHBOARD_PORT: "8090"
			}
		}
	]
};
