"use strict";

const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "patches", "hapCrypto.js");
const dest = path.join(
	__dirname,
	"..",
	"node_modules",
	"hap-nodejs",
	"dist",
	"lib",
	"util",
	"hapCrypto.js"
);

if (!fs.existsSync(src)) {
	console.warn("[MMM-HomeKit] hapCrypto patch source missing, skip");
	process.exit(0);
}

if (!fs.existsSync(path.dirname(dest))) {
	console.warn("[MMM-HomeKit] hap-nodejs not installed yet, skip crypto patch");
	process.exit(0);
}

fs.copyFileSync(src, dest);
console.info("[MMM-HomeKit] Applied hapCrypto Electron/@noble/ciphers patch");
