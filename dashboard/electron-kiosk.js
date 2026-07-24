#!/usr/bin/env node
"use strict";

/**
 * Electron kiosk shell for the HTML dashboard.
 * Uses the same Electron binary that already works with this Waveshare panel.
 */

const { app, BrowserWindow } = require("electron");

const PORT = Number(process.env.DASHBOARD_PORT || 8090);
const URL = process.env.DASHBOARD_URL || `http://127.0.0.1:${PORT}/`;

app.commandLine.appendSwitch("ozone-platform", "wayland");
app.commandLine.appendSwitch("enable-features", "UseOzonePlatform");

async function waitForServer (url, tries = 40) {
	for (let i = 0; i < tries; i++) {
		try {
			const res = await fetch(url);
			if (res.ok) return;
		} catch {
			/* retry */
		}
		await new Promise((r) => setTimeout(r, 250));
	}
}

app.whenReady().then(async () => {
	await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

	const win = new BrowserWindow({
		width: 1480,
		height: 320,
		x: 0,
		y: 0,
		fullscreen: true,
		autoHideMenuBar: true,
		frame: false,
		backgroundColor: "#000000",
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true
		}
	});

	win.setMenuBarVisibility(false);
	await win.loadURL(URL);
	win.show();
});

app.on("window-all-closed", () => {
	app.quit();
});
