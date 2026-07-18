/* Config
 *
 * Optimized for Waveshare portrait panel 320×1480.
 * Private values come from config/config.env via ${VAR_NAME}.
 * see https://docs.magicmirror.builders/configuration/introduction.html
 */
let config = {
	// Bind all interfaces so LAN can open /homekit pairing UI
	address: "0.0.0.0",
	port: 8080,
	basePath: "/",
	ipWhitelist: [],

	useHttps: false,
	httpsPrivateKey: "",
	httpsCertificate: "",

	// Redact SECRET_* from browser /config (not used for calendar/weather URLs)
	hideConfigSecrets: true,

	language: "zh-tw",
	locale: "zh-TW",
	logLevel: ["INFO", "LOG", "WARN", "ERROR"],
	timeFormat: 24,
	units: "metric",

	electronOptions: {
		fullscreen: true,
		webPreferences: {
			webviewTag: false
		}
	},

	modules: [
		{
			module: "alert"
		},
		{
			// Edit config/config.env via http://<host>:8080/admin/
			module: "MMM-EnvEditor"
		},
		{
			// Needed by MMM-HomeKit screenControl (REMOTE_ACTION MONITORON/OFF)
			// https://github.com/Jopyth/MMM-Remote-Control
			module: "MMM-Remote-Control",
			config: {
				customCommand: {
					// wlopm alone sometimes leaves Waveshare black; re-assert mode on wake
					monitorOnCommand:
						'export WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000; wlopm --on HDMI-A-1; sleep 0.5; wlr-randr --output HDMI-A-1 --on --mode 320x1480',
					monitorOffCommand:
						'export WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000; wlopm --off HDMI-A-1',
					monitorStatusCommand:
						'export WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000; wlopm | grep -q "HDMI-A-1 on" && echo true || echo false'
				}
			}
		},
		{
			// HomeKit bridge for Apple Home — pair via QR in module helper UI
			// https://github.com/Fabrizz/MMM-HomeKit
			module: "MMM-HomeKit",
			config: {
				screenControl: {
					name: "MagicMirror Monitor"
				},
				accentColor: false,
				pageControl: {
					name: "MagicMirror Pages",
					pages: ["主頁", "Sonarr"]
				},
				playerFocus: {
					name: "Player Focus"
				},
				toggleLyrics: false,
				useExperimentalBridge: false
			}
		},
		{
			// https://github.com/edward-shen/MMM-pages
			// Page 0 = main content; page 1 = blank (placeholder for later)
			module: "MMM-pages",
			config: {
				animationTime: 400,
				timings: { default: 0 },
				rotationHomePage: 0,
				homePage: 0,
				modules: [
					["page0"],
					["page1"]
				],
				fixed: [
					"MMM-PageSwipe",
					"MMM-Remote-Control",
					"MMM-HomeKit",
					"MMM-EnvEditor",
					"alert"
				]
			}
		},
		{
			// Swipe up/left = next page; down/right = previous (Waveshare touch)
			module: "MMM-PageSwipe",
			config: {
				minDistance: 70,
				maxTime: 900,
				ignoreSelector:
					"button, a, input, .indicator, .circle-wrapper, .mmm-unifiprotect-native-live, video, iframe, .mmm-playerfocus-btn, .MMM-PlayerFocus"
			}
		},
		{
			module: "clock",
			classes: "page0",
			position: "top_bar",
			config: {
				displaySeconds: false,
				showPeriod: false,
				dateFormat: "MMM D (ddd)",
				showWeek: false
			}
		},
		{
			module: "weather",
			classes: "page0",
			position: "upper_third",
			config: {
				weatherProvider: "hko",
				type: "current",
				station: "${HKO_STATION}",
				themeDir: "themes/animated",
				onlyTemp: true,
				showHumidity: "temp",
				showSun: false,
				showFeelsLike: false,
				roundTemp: true,
				showPrecipitationAmount: true,
				appendLocationNameToHeader: false
			}
		},
		{
			// HKO Special Weather Tips — https://data.weather.gov.hk (dataType=swt)
			// Hidden when no tip is in force
			module: "MMM-HKO-SpecialTips",
			classes: "page0",
			position: "upper_third",
			config: {
				lang: "tc",
				header: "特別天氣提示",
				maxTips: 2,
				hideWhenEmpty: true,
				updateInterval: 5 * 60 * 1000
			}
		},
		{
			module: "weather",
			classes: "page0",
			position: "upper_third",
			config: {
				weatherProvider: "hko",
				type: "forecast",
				themeDir: "themes/animated",
				maxNumberOfDays: 3,
				tableClass: "small",
				fade: false,
				roundTemp: true,
				colored: true,
				showPrecipitationProbability: true,
				appendLocationNameToHeader: false
			}
		},
		{
			// 268X 洪福邨開出 + 276P 洪水橋站往上水
			module: "MMM-HK-Transport-ETA",
			classes: "page0 kmb-eta",
			position: "upper_third",
			config: {
				transportETAProvider: "kmb",
				sta: "2DDEDEFABFB2ED87",
				stop_ids: [
					"2DDEDEFABFB2ED87",
					"0BFC5F7FC4A2D431"
				],
				routes: ["268X", "276P"],
				dirs: ["O"],
				stopInfo: {
					stopName: "九巴",
					lastUpdated: 1
				},
				reloadInterval: 60 * 1000,
				updateInterval: 5 * 1000,
				tableClass: "xsmall",
				showHeader: true,
				hideWhenEmpty: true
			}
		},
		{
			module: "calendar",
			classes: "page0 calendar-holidays",
			header: "公眾假期",
			position: "upper_third",
			config: {
				maximumEntries: 1,
				maximumNumberOfDays: 7,
				hideWhenEmpty: true,
				tableClass: "xsmall",
				wrapEvents: false,
				maxTitleLength: 12,
				fade: false,
				displaySymbol: false,
				coloredText: true,
				timeFormat: "absolute",
				dateFormat: "M/D",
				fullDayEventDateFormat: "M/D",
				hideTime: true,
				calendars: [
					{
						fetchInterval: 7 * 24 * 60 * 60 * 1000,
						name: "公眾假期",
						color: "#ff4d4f",
						url: "${HOLIDAYS_ICS_URL}"
					}
				]
			}
		},
		{
			module: "calendar",
			classes: "page0 calendar-personal",
			header: "${CALENDAR_NAME}",
			position: "upper_third",
			config: {
				maximumEntries: 20,
				maximumNumberOfDays: 7,
				tableClass: "xsmall",
				wrapEvents: false,
				maxTitleLength: 12,
				fade: false,
				displaySymbol: false,
				coloredText: true,
				timeFormat: "absolute",
				dateFormat: "M/D",
				fullDayEventDateFormat: "M/D",
				hideDuplicates: true,
				hideTime: true,
				calendars: [
					{
						fetchInterval: 15 * 60 * 1000,
						name: "${CALENDAR_NAME}",
						color: "${CALENDAR_COLOR}",
						url: "${CALENDAR_URL}"
					}
				]
			}
		},
		{
			// https://github.com/johnster000/MMM-NowPlaying
			// Shows Nest / Chromecast now-playing via local Cast (no API keys)
			module: "MMM-NowPlaying",
			classes: "page0",
			position: "upper_third",
			config: {
				maxWidth: "300px",
				showAlbum: true,
				pollInterval: 5000,
				updateFadeSpeed: 400,
				adminPort: 8083
			}
		},
		{
			// Sit directly under NowPlaying; HomeKit + touch toggle
			module: "MMM-PlayerFocus",
			classes: "page0",
			position: "upper_third",
			config: {}
		},
		{
			// https://github.com/gravitykillseverything/MMM-Sonarr
			// Fill SONARR_* in config/config.env — shown on page 2
			module: "MMM-Sonarr",
			classes: "page1",
			header: "Sonarr",
			position: "upper_third",
			config: {
				apiKey: "${SONARR_API_KEY}",
				baseUrl: "${SONARR_BASE_URL}",
				upcomingLimit: 6,
				historyLimit: 4,
				updateInterval: 5 * 60 * 1000,
				language: "zh-tw"
			}
		},
		{
			// https://github.com/awestley/MMM-UniFiProtect
			// Fill UNIFI_PROTECT_* in config/config.env (local Protect admin)
			module: "MMM-UniFiProtect",
			classes: "page0",
			position: "bottom_bar",
			config: {
				host: "${UNIFI_PROTECT_HOST}",
				username: "${UNIFI_PROTECT_USERNAME}",
				password: "${UNIFI_PROTECT_PASSWORD}",
				apiKey: "${UNIFI_PROTECT_API_KEY}",
				cameras: String("${UNIFI_PROTECT_CAMERA_NAMES}")
					.split(",")
					.map((s) => s.trim())
					.filter((s) => s.length > 0)
					.map((name) => ({ name })),
				protectNativeLive: true,
				compactMode: true,
				showMotionEvents: false,
				showRingEvents: false,
				showSmartEvents: false,
				useMagicMirrorAlerts: false,
				doorbellOverlay: false,
				debugLogging: true
			}
		},
		{
			module: "MMM-LocalIP",
			classes: "page0",
			position: "bottom_bar",
			config: {
				prefix: "IP "
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
