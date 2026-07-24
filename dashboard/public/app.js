(() => {
	"use strict";

	const $ = (id) => document.getElementById(id);
	const weekday = ["日", "一", "二", "三", "四", "五", "六"];
	const HK = { lat: 22.3, lon: 114.17 };
	/** 設為 true 可模擬無風暴版面；看完改回 false */
	const SIMULATE_HIDE_STORM = false;
	const ANIM_HTML =
		'<div class="anim-bg"></div>'
		+ '<div class="anim-sun"><span class="sun-rays"></span></div>'
		+ '<div class="anim-cloud">'
		+ '<span class="puff p1"></span><span class="puff p2"></span><span class="puff p3"></span>'
		+ '</div>'
		+ '<div class="anim-rain"><i></i><i></i><i></i><i></i><i></i></div>'
		+ '<div class="anim-bolt"></div>'
		+ '<div class="anim-wind"><i></i><i></i><i></i></div>';

	const store = {
		mem: Object.create(null),
		key (name) {
			return `mmDash:${name}`;
		},
		get (name) {
			if (Object.prototype.hasOwnProperty.call(this.mem, name)) return this.mem[name];
			try {
				const raw = localStorage.getItem(this.key(name));
				if (!raw) return null;
				const parsed = JSON.parse(raw);
				this.mem[name] = parsed;
				return parsed;
			} catch {
				return null;
			}
		},
		set (name, value) {
			this.mem[name] = value;
			try {
				localStorage.setItem(this.key(name), JSON.stringify(value));
			} catch {
				/* quota / private mode */
			}
		},
		/** 成功資料才寫入；回傳是否與快取不同 */
		save (name, value) {
			const prev = this.get(name);
			const changed = JSON.stringify(prev) !== JSON.stringify(value);
			this.set(name, value);
			return changed;
		}
	};

	function pad (n) {
		return String(n).padStart(2, "0");
	}

	function flash (el) {
		if (!el) return;
		el.classList.remove("flash");
		void el.offsetWidth;
		el.classList.add("flash");
	}

	function tickClock () {
		const now = new Date();
		$("dateMd").textContent = `${now.getMonth() + 1}月${now.getDate()}日`;
		$("dateWeek").textContent = `週${weekday[now.getDay()]}`;
		const next = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
		if ($("time").textContent !== next) {
			$("time").textContent = next;
			flash($("time"));
		}
	}

	async function getJson (url) {
		const res = await fetch(url, { cache: "no-store" });
		if (!res.ok) throw new Error(`${url} ${res.status}`);
		return res.json();
	}

	function setAnim (el, anim) {
		el.dataset.anim = anim || "cloudy";
	}

	function shortPsr (psr) {
		const s = String(psr || "").trim();
		if (!s) return "";
		return s.replace(/^降水/, "");
	}

	const FORECAST_DAYS = 3;

	function renderForecast (days) {
		const row = $("forecastRow");
		row.innerHTML = "";
		(days || []).slice(1, 1 + FORECAST_DAYS).forEach((day, i) => {
			const el = document.createElement("div");
			el.className = "forecast-day" + (i === 0 ? " is-first" : "");

			const week = document.createElement("div");
			week.className = "forecast-week";
			week.textContent = (day.week || "").replace(/^星期/, "週") || "—";

			const iconWrap = document.createElement("div");
			iconWrap.className = "forecast-icon-wrap";
			const anim = document.createElement("div");
			anim.className = "wx-anim";
			anim.innerHTML = ANIM_HTML;
			setAnim(anim, day.anim);
			iconWrap.appendChild(anim);

			const temps = document.createElement("div");
			temps.className = "forecast-temps";
			temps.innerHTML = `<span class="max">${day.max ?? "—"}°</span><span class="min">${day.min ?? "—"}°</span>`;

			const psr = document.createElement("div");
			psr.className = "forecast-psr";
			psr.textContent = shortPsr(day.psr);

			el.appendChild(week);
			el.appendChild(iconWrap);
			el.appendChild(temps);
			el.appendChild(psr);
			row.appendChild(el);
		});
	}

	function project (points) {
		const all = points.filter((p) => p && typeof p.lat === "number" && typeof p.lon === "number");
		if (!all.length) {
			return {
				xy: () => [0, 0],
				all,
				bounds: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 }
			};
		}
		const lats = all.map((p) => p.lat);
		const lons = all.map((p) => p.lon);
		lats.push(HK.lat);
		lons.push(HK.lon);
		const minLat = Math.min(...lats) - 1.5;
		const maxLat = Math.max(...lats) + 1.5;
		const minLon = Math.min(...lons) - 1.8;
		const maxLon = Math.max(...lons) + 1.8;
		const inset = 10;
		const w = 240 - inset * 2;
		const h = 200 - inset * 2;
		const xy = (lat, lon) => {
			const x = inset + ((lon - minLon) / (maxLon - minLon || 1)) * w;
			const y = inset + (1 - (lat - minLat) / (maxLat - minLat || 1)) * h;
			return [x, y];
		};
		return { xy, all, bounds: { minLat, maxLat, minLon, maxLon } };
	}

	function intensityColor (intensity, wind) {
		const s = String(intensity || "").toLowerCase();
		const km = Number(String(wind || "").replace(/[^\d.]/g, "")) || 0;
		if (/super/.test(s) || km >= 185) return "#ff2d55";
		if (/severe\s*typhoon|強烈颱風/.test(s) || km >= 150) return "#bf5af2";
		if (/\btyphoon\b|颱風/.test(s) || km >= 118) return "#ff453a";
		if (/severe\s*tropical\s*storm|強烈熱帶風暴/.test(s) || km >= 88) return "#ff9f0a";
		if (/tropical\s*storm|熱帶風暴/.test(s) || km >= 63) return "#ffd60a";
		if (/depression|低氣壓/.test(s) || km >= 41) return "#30d158";
		if (/low\s*pressure|低壓/.test(s)) return "#8e8e93";
		return "#64d2ff";
	}

	function intensityLabelZh (intensity) {
		const s = String(intensity || "");
		const map = [
			[/Super Typhoon/i, "超強颱風"],
			[/Severe Typhoon/i, "強烈颱風"],
			[/Typhoon/i, "颱風"],
			[/Severe Tropical Storm/i, "強烈熱帶風暴"],
			[/Tropical Storm/i, "熱帶風暴"],
			[/Tropical Depression/i, "熱帶低氣壓"],
			[/Low Pressure Area/i, "低壓區"]
		];
		for (const [re, zh] of map) {
			if (re.test(s)) return zh;
		}
		return s || "—";
	}

	function ensureDefs (svg) {
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		defs.innerHTML = `
			<linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#1a6bb5"/>
				<stop offset="55%" stop-color="#0d4f8a"/>
				<stop offset="100%" stop-color="#083560"/>
			</linearGradient>
			<linearGradient id="landFill" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0%" stop-color="#3d8f4a"/>
				<stop offset="100%" stop-color="#2a6b38"/>
			</linearGradient>
			<filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
				<feGaussianBlur stdDeviation="2.4" result="b"/>
				<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
			</filter>
			<filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
				<feGaussianBlur stdDeviation="0.8" result="b"/>
				<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
			</filter>`;
		svg.appendChild(defs);
	}

	function svgEl (svg, name, attrs) {
		const node = document.createElementNS("http://www.w3.org/2000/svg", name);
		Object.entries(attrs || {}).forEach(([k, v]) => {
			if (v != null) node.setAttribute(k, String(v));
		});
		svg.appendChild(node);
		return node;
	}

	function drawLand (svg, xy) {
		const lands = [
			[
				[26.5, 116], [25.2, 118.5], [24.5, 120.2], [23.5, 120.5], [22.8, 120.2],
				[22.2, 114.5], [21.8, 113.2], [21.5, 111], [21.8, 109.5], [22.5, 108.5],
				[24, 109], [25.5, 111], [26.5, 114]
			],
			[[25.3, 121.5], [24.8, 121.9], [23.5, 121.5], [22.0, 120.9], [22.7, 120.2], [24.0, 120.5], [25.1, 121.0]],
			[[18.6, 120.6], [18.2, 122.2], [16.5, 122.0], [16.2, 120.0], [17.5, 120.0]]
		];
		lands.forEach((ring) => {
			svgEl(svg, "polygon", {
				points: ring.map(([lat, lon]) => xy(lat, lon).join(",")).join(" "),
				fill: "url(#landFill)",
				stroke: "rgba(180, 230, 160, 0.35)",
				"stroke-width": "0.8",
				opacity: "0.92"
			});
		});
	}

	function drawGrid (svg, bounds, xy) {
		const { minLat, maxLat, minLon, maxLon } = bounds;
		for (let lat = Math.ceil(minLat); lat <= Math.floor(maxLat); lat += 2) {
			const [x1, y] = xy(lat, minLon);
			const [x2] = xy(lat, maxLon);
			svgEl(svg, "line", {
				x1, y1: y, x2, y2: y,
				stroke: "rgba(255,255,255,0.12)",
				"stroke-width": "0.6"
			});
			svgEl(svg, "text", {
				x: x1 + 2, y: y - 2,
				fill: "rgba(210,230,255,0.55)",
				"font-size": "7",
				"font-family": "system-ui,sans-serif"
			}).textContent = `${lat}°N`;
		}
		for (let lon = Math.ceil(minLon); lon <= Math.floor(maxLon); lon += 2) {
			const [x, y1] = xy(minLat, lon);
			const [, y2] = xy(maxLat, lon);
			svgEl(svg, "line", {
				x1: x, y1, x2: x, y2,
				stroke: "rgba(255,255,255,0.1)",
				"stroke-width": "0.6"
			});
		}
	}

	function segmentTrack (svg, points, xy, width) {
		for (let i = 0; i < points.length - 1; i++) {
			const a = points[i];
			const b = points[i + 1];
			const [x1, y1] = xy(a.lat, a.lon);
			const [x2, y2] = xy(b.lat, b.lon);
			const color = intensityColor(b.intensity || a.intensity, b.wind || a.wind);
			svgEl(svg, "line", {
				x1, y1, x2, y2,
				stroke: color,
				"stroke-width": width,
				"stroke-linecap": "round",
				filter: "url(#soft)"
			});
		}
	}

	function drawForecastCone (svg, pts) {
		if (pts.length < 3) return;
		const left = [];
		const right = [];
		for (let i = 0; i < pts.length; i++) {
			const t = i / (pts.length - 1 || 1);
			const spread = 4 + t * 16;
			const [x, y] = pts[i];
			const prev = pts[Math.max(0, i - 1)];
			const next = pts[Math.min(pts.length - 1, i + 1)];
			const dx = next[0] - prev[0];
			const dy = next[1] - prev[1];
			const len = Math.hypot(dx, dy) || 1;
			const nx = (-dy / len) * spread;
			const ny = (dx / len) * spread;
			left.push([x + nx, y + ny]);
			right.push([x - nx, y - ny]);
		}
		const poly = [...left, ...right.reverse()];
		svgEl(svg, "polygon", {
			points: poly.map((p) => p.join(",")).join(" "),
			fill: "rgba(255, 214, 10, 0.16)",
			stroke: "rgba(255, 214, 10, 0.35)",
			"stroke-width": "0.8"
		});
	}

	function renderStorm (data) {
		const panel = $("stormPanel");
		if (!data?.active || !Array.isArray(data.storms) || !data.storms.length) {
			panel.hidden = true;
			return;
		}
		const storm = data.storms[0];
		panel.hidden = false;
		$("stormName").textContent = storm.nameZh || storm.nameEn || "";

		const past = storm.past || [];
		const analysis = storm.analysis || [];
		const forecast = storm.forecast || [];
		const { xy, bounds } = project([...past, ...analysis, ...forecast, HK]);

		const svg = $("stormMap");
		svg.innerHTML = "";
		ensureDefs(svg);

		svgEl(svg, "rect", { x: 0, y: 0, width: 240, height: 220, fill: "url(#ocean)" });
		drawLand(svg, xy);
		drawGrid(svg, bounds, xy);

		const trackPts = [...past];
		const cur = analysis[0] || past[past.length - 1];
		if (cur && (!past.length || past[past.length - 1].lat !== cur.lat || past[past.length - 1].lon !== cur.lon)) {
			trackPts.push(cur);
		}
		segmentTrack(svg, trackPts, xy, 3.2);

		const forecastXY = [];
		if (cur) forecastXY.push(xy(cur.lat, cur.lon));
		forecast.forEach((p) => forecastXY.push(xy(p.lat, p.lon)));
		drawForecastCone(svg, forecastXY);
		if (forecastXY.length > 1) {
			svgEl(svg, "polyline", {
				points: forecastXY.map((p) => p.join(",")).join(" "),
				fill: "none",
				stroke: "#ffffff",
				"stroke-width": "2.2",
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				"stroke-dasharray": "5 4",
				opacity: "0.95"
			});
		}

		trackPts.forEach((p, i) => {
			const [x, y] = xy(p.lat, p.lon);
			const color = intensityColor(p.intensity, p.wind);
			const r = i === trackPts.length - 1 ? 4.2 : 2.6;
			svgEl(svg, "circle", { cx: x, cy: y, r: r + 1.2, fill: "rgba(0,0,0,0.25)" });
			svgEl(svg, "circle", { cx: x, cy: y, r, fill: color, stroke: "#fff", "stroke-width": "0.8" });
		});

		forecast.forEach((p, i) => {
			if (i % 3 !== 0 && i !== forecast.length - 1) return;
			const [x, y] = xy(p.lat, p.lon);
			svgEl(svg, "circle", {
				cx: x, cy: y, r: 2.2,
				fill: intensityColor(p.intensity, p.wind),
				stroke: "#fff",
				"stroke-width": "0.7",
				opacity: "0.9"
			});
		});

		const [hkx, hky] = xy(HK.lat, HK.lon);
		svgEl(svg, "circle", {
			cx: hkx, cy: hky, r: 10,
			fill: "none",
			stroke: "#ffd60a",
			"stroke-width": "1.2",
			"stroke-dasharray": "2 2",
			opacity: "0.85"
		});
		svgEl(svg, "circle", { cx: hkx, cy: hky, r: 3.6, fill: "#ffd60a", stroke: "#fff", "stroke-width": "0.8" });
		svgEl(svg, "text", {
			x: hkx + 6, y: hky + 3,
			fill: "#ffe8a3",
			"font-size": "9",
			"font-weight": "700",
			"font-family": "system-ui,sans-serif"
		}).textContent = "香港";

		if (cur) {
			const [cx, cy] = xy(cur.lat, cur.lon);
			const color = intensityColor(cur.intensity, cur.wind);
			svgEl(svg, "circle", { cx, cy, r: 9, fill: color, opacity: "0.28", filter: "url(#glow)" });
			svgEl(svg, "circle", { cx, cy, r: 5.5, fill: color, stroke: "#fff", "stroke-width": "1.4" });
			svgEl(svg, "circle", { cx, cy, r: 2, fill: "#fff" });
		}

		[["#30d158", "低"], ["#ffd60a", "風"], ["#ff9f0a", "強"], ["#ff453a", "颱"]].forEach(([c, t], i) => {
			const x = 12 + i * 28;
			const y = 208;
			svgEl(svg, "circle", { cx: x, cy: y, r: 3, fill: c, stroke: "#fff", "stroke-width": "0.5" });
			svgEl(svg, "text", {
				x: x + 5, y: y + 3,
				fill: "rgba(255,255,255,0.8)",
				"font-size": "7",
				"font-family": "system-ui,sans-serif"
			}).textContent = t;
		});

		const bits = [];
		if (cur?.intensity) bits.push(intensityLabelZh(cur.intensity));
		if (cur?.wind) bits.push(cur.wind);
		$("stormMeta").textContent = bits.join(" · ");
	}

	function applyTips (tips) {
		const box = $("wxTips");
		const viewport = $("wxTipsViewport");
		const track = $("wxTipsTrack");
		const items = (Array.isArray(tips) ? tips : []).map((t) => String(t || "").trim()).filter(Boolean);
		if (!items.length) {
			box.hidden = true;
			track.innerHTML = "";
			viewport.classList.remove("is-scroll");
			return;
		}

		box.hidden = false;
		const body = items.map((t) => `<p>${t}</p>`).join("");
		track.innerHTML = body;
		viewport.classList.remove("is-scroll");
		viewport.style.removeProperty("--tips-dur");

		requestAnimationFrame(() => {
			if (track.scrollHeight > viewport.clientHeight + 2) {
				track.innerHTML = body + body;
				viewport.classList.add("is-scroll");
				const chars = items.join("").length;
				viewport.style.setProperty("--tips-dur", `${Math.max(10, Math.min(28, chars * 0.12))}s`);
			}
		});
	}

	function applyWeather (data) {
		if (!data || !data.ok) return;
		$("wxStation").textContent = data.station || "—";
		$("wxTemp").innerHTML = data.temperature == null
			? `—<span class="wx-unit">°</span>`
			: `${Math.round(data.temperature)}<span class="wx-unit">°</span>`;
		$("wxHum").innerHTML = data.humidity == null
			? '<i class="wx-hum-icon" aria-hidden="true"></i>—%'
			: `<i class="wx-hum-icon" aria-hidden="true"></i>${Math.round(data.humidity)}%`;

		const today = Array.isArray(data.forecast) ? data.forecast[0] : null;
		const range = $("wxRange");
		if (today?.max != null && today?.min != null) {
			range.hidden = false;
			range.innerHTML =
				`<span class="hi">${today.max}°</span>`
				+ `<span class="sep">/</span>`
				+ `<span class="lo">${today.min}°</span>`;
		} else {
			range.hidden = true;
			range.innerHTML = "";
		}

		setAnim($("wxAnim"), data.anim);
		renderForecast(data.forecast);

		const chips = $("warnChips");
		chips.innerHTML = "";
		const warnings = Array.isArray(data.warnings) ? data.warnings : [];
		if (!warnings.length) {
			chips.hidden = true;
		} else {
			chips.hidden = false;
			warnings.slice(0, 2).forEach((w) => {
				const li = document.createElement("li");
				li.textContent = w;
				chips.appendChild(li);
			});
		}

		applyTips(data.tips);
	}

	async function refreshWeather () {
		try {
			const data = await getJson("/api/weather");
			if (!data.ok) return;
			const changed = store.save("weather", data);
			applyWeather(data);
			if (changed) flash($("wxTemp"));
		} catch (e) {
			console.warn("weather", e);
			const cached = store.get("weather");
			if (cached) applyWeather(cached);
		}
	}

	function shouldHideStorm () {
		const params = new URLSearchParams(location.search);
		return (
			SIMULATE_HIDE_STORM
			|| params.has("nostorm")
			|| params.get("hideStorm") === "1"
			|| localStorage.getItem("mmHideStorm") === "1"
		);
	}

	async function refreshStorm () {
		if (shouldHideStorm()) {
			renderStorm({ active: false, storms: [] });
			return;
		}
		try {
			const data = await getJson("/api/storm");
			store.save("storm", data);
			renderStorm(data);
		} catch (e) {
			console.warn("storm", e);
			const cached = store.get("storm");
			if (cached) renderStorm(cached);
			/* 有快取就不清成空白／強制隱藏 */
		}
	}

	function applyDht (data) {
		if (!data || !data.ok) return;
		if (data.temperature == null || data.humidity == null) return;
		$("dhtTemp").innerHTML = `${Math.round(data.temperature)}<span class="dht-unit">°</span>`;
		$("dhtHum").textContent = `${Math.round(data.humidity)}%`;
	}

	async function refreshDht () {
		try {
			const data = await getJson("/api/dht");
			if (!data.ok) return;
			const changed = store.save("dht", data);
			applyDht(data);
			if (changed) flash($("dht"));
		} catch (e) {
			console.warn("dht", e);
			const cached = store.get("dht");
			if (cached) applyDht(cached);
		}
	}

	function dayKey (d) {
		return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
	}

	function mdLabel (d) {
		return `${d.getMonth() + 1}/${d.getDate()}`;
	}

	function startOfDay (d) {
		return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	}

	function formatWhenRange (startIso, endIso, allDay) {
		const start = new Date(startIso);
		const end = endIso ? new Date(endIso) : start;
		const now = new Date();
		const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
		const sameDay = dayKey(start) === dayKey(end);

		if (sameDay) {
			if (dayKey(start) === dayKey(now)) {
				if (allDay) return "今天";
				return `今天 ${pad(start.getHours())}:${pad(start.getMinutes())}`;
			}
			if (dayKey(start) === dayKey(tomorrow)) {
				if (allDay) return "明天";
				return `明天 ${pad(start.getHours())}:${pad(start.getMinutes())}`;
			}
			if (allDay) return mdLabel(start);
			return `${mdLabel(start)} ${pad(start.getHours())}:${pad(start.getMinutes())}`;
		}

		return `${mdLabel(start)} - ${mdLabel(end)}`;
	}

	function mergeCalendarEvents (events) {
		const sorted = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));
		const groups = [];
		for (const ev of sorted) {
			const title = String(ev.title || "").trim();
			const start = new Date(ev.start);
			const last = groups[groups.length - 1];
			if (
				last
				&& last.title === title
				&& last.color === (ev.color || "")
				&& startOfDay(start) - startOfDay(new Date(last.endIso || last.startIso)) === 24 * 60 * 60 * 1000
			) {
				last.endIso = ev.start;
				last.allDay = last.allDay && !!ev.allDay;
				continue;
			}
			groups.push({
				title,
				color: ev.color || "",
				startIso: ev.start,
				endIso: ev.start,
				allDay: !!ev.allDay
			});
		}
		return groups;
	}

	function applyCalendar (data) {
		const list = $("calList");
		const events = Array.isArray(data?.events) ? data.events : [];
		if (!events.length) {
			if (!list.querySelector(".cal-title")) {
				list.innerHTML = '<li class="dimmed">近期無行程</li>';
			}
			return;
		}
		list.innerHTML = "";
		const today = startOfDay(new Date());
		mergeCalendarEvents(events).slice(0, 7).forEach((ev) => {
			const li = document.createElement("li");
			const s = startOfDay(new Date(ev.startIso));
			const e = startOfDay(new Date(ev.endIso || ev.startIso));
			if (s <= today && e >= today) li.classList.add("is-today");

			const when = document.createElement("span");
			when.className = "cal-when";
			when.textContent = formatWhenRange(ev.startIso, ev.endIso, ev.allDay);

			const title = document.createElement("span");
			title.className = "cal-title";
			title.textContent = ev.title;
			title.style.setProperty("--cal-color", ev.color || "var(--blue)");

			li.appendChild(when);
			li.appendChild(title);
			list.appendChild(li);
		});
	}

	async function refreshCalendar () {
		try {
			const data = await getJson("/api/calendar");
			if (!data?.ok && !Array.isArray(data?.events)) return;
			store.save("calendar", data);
			applyCalendar(data);
		} catch (e) {
			console.warn("calendar", e);
			const cached = store.get("calendar");
			if (cached) applyCalendar(cached);
		}
	}

	function shortHaName (name, entityId) {
		const n = String(name || "").trim();
		if (n && n !== entityId) return n.replace(/^臥室/, "").trim() || n;
		const id = String(entityId || "");
		if (id.includes("leng_qi")) return "冷氣";
		if (id.includes("shui_fang_deng")) return "睡房燈";
		if (id.includes("wall_switch")) return "燈掣";
		if (id.includes("feng_shan")) return "風扇";
		if (id.includes("04018130496")) return "蚊香";
		return n || "裝置";
	}

	function climateModeLabel (state) {
		const map = {
			off: "關",
			cool: "冷氣",
			heat: "暖風",
			heat_cool: "自動",
			dry: "抽濕",
			fan_only: "送風"
		};
		return map[state] || state || "—";
	}

	async function postJson (url, body) {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			cache: "no-store"
		});
		if (!res.ok) throw new Error(`${url} ${res.status}`);
		return res.json();
	}

	function bindPress (el, fn) {
		el.addEventListener(
			"click",
			(e) => {
				e.preventDefault();
				e.stopPropagation();
				fn();
			},
			{ passive: false }
		);
	}

	let haCache = [];
	let mediaProgressTimer = null;
	let mediaProgressRefs = null;

	function stopMediaProgress () {
		if (mediaProgressTimer) {
			clearInterval(mediaProgressTimer);
			mediaProgressTimer = null;
		}
		mediaProgressRefs = null;
	}

	function formatMediaTime (seconds) {
		const s = Math.max(0, Math.floor(Number(seconds) || 0));
		const m = Math.floor(s / 60);
		const r = s % 60;
		return `${m}:${String(r).padStart(2, "0")}`;
	}

	function getMediaProgress (player) {
		let pos = Number(player.position);
		let dur = Number(player.duration);
		if (!Number.isFinite(pos) || pos < 0) pos = 0;
		if (!Number.isFinite(dur) || dur <= 0) return { pos: 0, dur: 0, pct: 0 };
		if (player.state === "playing" && player.positionUpdated) {
			const delta = (Date.now() - new Date(player.positionUpdated).getTime()) / 1000;
			if (Number.isFinite(delta) && delta > 0) pos += delta;
		}
		pos = Math.min(pos, dur);
		return { pos, dur, pct: Math.min(100, (pos / dur) * 100) };
	}

	function updateMediaProgressDom () {
		if (!mediaProgressRefs?.player) return;
		const { pos, dur, pct } = getMediaProgress(mediaProgressRefs.player);
		if (!(dur > 0)) {
			mediaProgressRefs.root.hidden = true;
			stopMediaProgress();
			return;
		}
		mediaProgressRefs.root.hidden = false;
		mediaProgressRefs.fill.style.width = `${pct}%`;
		mediaProgressRefs.elapsed.textContent = formatMediaTime(pos);
		mediaProgressRefs.duration.textContent = formatMediaTime(dur);
	}

	function startMediaProgress (player, refs) {
		stopMediaProgress();
		mediaProgressRefs = { ...refs, player };
		updateMediaProgressDom();
		if (player.state === "playing" && Number(player.duration) > 0) {
			mediaProgressTimer = setInterval(updateMediaProgressDom, 500);
		}
	}

	let focusOn = false;
	let focusBrightness = loadFocusBrightness();
	let focusBrightnessHost = null;
	let focusBrightnessOverlay = null;
	let focusBrightnessSlider = null;
	let focusBrightnessValue = null;

	function clampFocusBrightness (value) {
		const n = Math.round(Number(value));
		if (!Number.isFinite(n)) return 100;
		return Math.max(10, Math.min(100, n));
	}

	function loadFocusBrightness () {
		try {
			const raw = localStorage.getItem("mmDash:playerFocusBrightness");
			if (raw !== null) return clampFocusBrightness(raw);
		} catch {
			/* ignore */
		}
		return 100;
	}

	function saveFocusBrightness () {
		try {
			localStorage.setItem("mmDash:playerFocusBrightness", String(focusBrightness));
		} catch {
			/* ignore */
		}
	}

	function applyFocusBrightness (value) {
		focusBrightness = clampFocusBrightness(value);
		if (focusBrightnessOverlay) {
			const opacity = (100 - focusBrightness) / 100;
			focusBrightnessOverlay.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
		}
		if (focusBrightnessSlider) focusBrightnessSlider.value = String(focusBrightness);
		if (focusBrightnessValue) focusBrightnessValue.textContent = `${focusBrightness}%`;
	}

	function ensureFocusBrightnessOverlay () {
		if (focusBrightnessOverlay) return;
		focusBrightnessOverlay = document.createElement("div");
		focusBrightnessOverlay.id = "playerFocusOverlayBrightness";
		focusBrightnessOverlay.className = "playerfocus-overlay-brightness is-hidden";
		document.documentElement.insertBefore(focusBrightnessOverlay, document.body);
	}

	function refreshFocusButton (btn) {
		btn.textContent = focusOn ? "退出" : "全覽";
		btn.classList.toggle("is-on", focusOn);
		btn.setAttribute("aria-pressed", focusOn ? "true" : "false");
		btn.title = focusOn ? "顯示全部模組" : "只顯示播放器";
	}

	function syncFocusBrightnessVisibility () {
		if (focusBrightnessHost) {
			focusBrightnessHost.classList.toggle("is-hidden", !focusOn);
		}
		if (focusBrightnessOverlay) {
			focusBrightnessOverlay.classList.toggle("is-hidden", !focusOn);
		}
	}

	function setPlayerFocus (on) {
		if (focusOn === on) return;
		focusOn = on;
		document.body.classList.toggle("player-focus", on);
		if (on) applyFocusBrightness(focusBrightness);
		syncFocusBrightnessVisibility();
		const btn = document.querySelector(".ha-media-focus-btn");
		if (btn) refreshFocusButton(btn);
	}

	function togglePlayerFocus () {
		setPlayerFocus(!focusOn);
	}

	function ensureFocusBrightness () {
		ensureFocusBrightnessOverlay();
		if (focusBrightnessHost) return;

		focusBrightnessHost = document.createElement("div");
		focusBrightnessHost.id = "playerFocusBrightness";
		focusBrightnessHost.className = "playerfocus-brightness is-hidden";

		const header = document.createElement("div");
		header.className = "playerfocus-brightness-header";

		const label = document.createElement("div");
		label.className = "playerfocus-brightness-label";
		label.textContent = "☀";

		focusBrightnessValue = document.createElement("span");
		focusBrightnessValue.className = "playerfocus-brightness-value";

		header.appendChild(focusBrightnessValue);
		header.appendChild(label);

		focusBrightnessSlider = document.createElement("input");
		focusBrightnessSlider.type = "range";
		focusBrightnessSlider.className = "playerfocus-brightness-slider";
		focusBrightnessSlider.min = "10";
		focusBrightnessSlider.max = "100";
		focusBrightnessSlider.step = "1";
		focusBrightnessSlider.setAttribute("aria-label", "全覽亮度");

		const stopSwipe = (e) => e.stopPropagation();
		focusBrightnessSlider.addEventListener("pointerdown", stopSwipe);
		focusBrightnessSlider.addEventListener("touchstart", stopSwipe, { passive: true });
		focusBrightnessSlider.addEventListener("input", () => {
			applyFocusBrightness(focusBrightnessSlider.value);
		});
		focusBrightnessSlider.addEventListener("change", () => {
			applyFocusBrightness(focusBrightnessSlider.value);
			saveFocusBrightness();
		});

		focusBrightnessHost.appendChild(header);
		focusBrightnessHost.appendChild(focusBrightnessSlider);
		document.body.appendChild(focusBrightnessHost);
		applyFocusBrightness(focusBrightness);
	}

	function pickMediaPlayer (entities) {
		const players = (Array.isArray(entities) ? entities : []).filter((e) => e.domain === "media_player");
		return players.find((p) => p.state === "playing") || null;
	}

	function shortMediaName (name, entityId) {
		const id = String(entityId || "");
		if (id.includes("homepod")) return "HomePod";
		if (id.includes("apple_tv")) return "Apple TV";
		if (id.includes("soundbar")) return "Soundbar";
		return shortHaName(name, entityId);
	}

	function renderMediaPlayer (player) {
		const card = document.createElement("div");
		card.className = "ha-media" + (player.state === "playing" ? " playing" : " paused");

		const artWrap = document.createElement("div");
		artWrap.className = "ha-media-art-wrap";

		const art = document.createElement("div");
		art.className = "ha-media-art";
		if (player.artUrl || player.title || player.artist) {
			const img = document.createElement("img");
			img.alt = "";
			img.loading = "lazy";
			img.referrerPolicy = "no-referrer";
			img.src = `/api/ha/art?entity=${encodeURIComponent(player.entity_id)}`;
			img.addEventListener("error", () => {
				img.remove();
				const ph = document.createElement("div");
				ph.className = "ha-media-art-ph";
				ph.innerHTML = '<span class="ha-media-note" aria-hidden="true"></span>';
				art.appendChild(ph);
			}, { once: true });
			art.appendChild(img);
		} else {
			const ph = document.createElement("div");
			ph.className = "ha-media-art-ph";
			ph.innerHTML = '<span class="ha-media-note" aria-hidden="true"></span>';
			art.appendChild(ph);
		}

		if (player.state === "playing") {
			const viz = document.createElement("div");
			viz.className = "ha-media-viz";
			viz.setAttribute("aria-hidden", "true");
			viz.innerHTML = "<i></i><i></i><i></i>";
			artWrap.appendChild(viz);
		}

		artWrap.appendChild(art);

		const focusBtn = document.createElement("button");
		focusBtn.type = "button";
		focusBtn.className = "ha-media-focus-btn" + (focusOn ? " is-on" : "");
		refreshFocusButton(focusBtn);
		bindPress(focusBtn, togglePlayerFocus);
		artWrap.appendChild(focusBtn);

		card.appendChild(artWrap);

		const body = document.createElement("div");
		body.className = "ha-media-body";

		const title = document.createElement("div");
		title.className = "ha-media-title";
		title.textContent = player.title || player.app || shortMediaName(player.name, player.entity_id);

		body.appendChild(title);

		const subText = player.artist || player.album || "";
		if (subText) {
			const sub = document.createElement("div");
			sub.className = "ha-media-sub";
			sub.textContent = subText;
			body.appendChild(sub);
		}

		const progress = document.createElement("div");
		progress.className = "ha-media-progress";
		const track = document.createElement("div");
		track.className = "ha-media-progress-track";
		const fill = document.createElement("div");
		fill.className = "ha-media-progress-fill";
		track.appendChild(fill);
		const times = document.createElement("div");
		times.className = "ha-media-progress-times";
		const elapsed = document.createElement("span");
		const duration = document.createElement("span");
		times.appendChild(elapsed);
		times.appendChild(duration);
		progress.appendChild(track);
		progress.appendChild(times);

		const controls = document.createElement("div");
		controls.className = "ha-media-controls";

		const prev = document.createElement("button");
		prev.type = "button";
		prev.className = "ha-media-btn";
		prev.setAttribute("aria-label", "上一首");
		prev.textContent = "⏮";
		bindPress(prev, () => haMediaAction(player.entity_id, "previous"));

		const play = document.createElement("button");
		play.type = "button";
		play.className = "ha-media-btn primary";
		play.setAttribute("aria-label", player.state === "playing" ? "暫停" : "播放");
		play.textContent = player.state === "playing" ? "⏸" : "▶";
		bindPress(play, () => haMediaAction(player.entity_id, "play_pause"));

		const next = document.createElement("button");
		next.type = "button";
		next.className = "ha-media-btn";
		next.setAttribute("aria-label", "下一首");
		next.textContent = "⏭";
		bindPress(next, () => haMediaAction(player.entity_id, "next"));

		controls.appendChild(prev);
		controls.appendChild(play);
		controls.appendChild(next);

		const contentWrap = document.createElement("div");
		contentWrap.className = "ha-media-content";
		contentWrap.appendChild(body);
		contentWrap.appendChild(progress);
		contentWrap.appendChild(controls);
		card.appendChild(contentWrap);

		startMediaProgress(player, { root: progress, fill, elapsed, duration });
		return card;
	}

	async function haMediaAction (entityId, action) {
		try {
			const data = await postJson("/api/ha/media", { entity: entityId, action });
			if (data?.entity) {
				haCache = haCache.map((e) => (e.entity_id === entityId ? data.entity : e));
				store.save("ha", { ok: true, entities: haCache });
				renderHa(haCache);
			} else {
				await refreshHa();
			}
		} catch (e) {
			console.warn("ha media", e);
			if (haCache.length) renderHa(haCache);
		}
	}

	function renderMediaPanel (entities) {
		const panel = $("haMediaPanel");
		const root = $("haMediaRoot");
		const media = pickMediaPlayer(entities);
		if (!media) {
			if (focusOn) setPlayerFocus(false);
			panel.hidden = true;
			stopMediaProgress();
			root.innerHTML = "";
			return;
		}
		panel.hidden = false;
		root.innerHTML = "";
		root.appendChild(renderMediaPlayer(media));
	}

	function renderHa (entities) {
		const root = $("haRoot");
		const next = Array.isArray(entities) ? entities : [];
		if (!next.length) {
			if (!haCache.length) root.innerHTML = '<div class="dimmed">無裝置</div>';
			return;
		}
		haCache = next;
		root.innerHTML = "";
		stopMediaProgress();
		renderMediaPanel(haCache);

		const climate = haCache.find((e) => e.domain === "climate");
		const tiles = haCache.filter((e) => e.domain !== "climate" && e.domain !== "media_player");

		if (climate) {
			const card = document.createElement("div");
			const isOn = climate.state && climate.state !== "off" && climate.state !== "unavailable";
			card.className = "ha-climate" + (isOn ? " on" : "");

			const name = document.createElement("div");
			name.className = "ha-climate-name";
			name.textContent = shortHaName(climate.name, climate.entity_id);

			const mode = document.createElement("div");
			mode.className = "ha-climate-mode";
			mode.textContent = climateModeLabel(climate.state);

			const temps = document.createElement("div");
			temps.className = "ha-climate-temps";
			temps.innerHTML =
				`<span class="cur">${climate.current ?? "—"}<span class="unit">°</span></span>`
				+ `<span class="tgt">設定 ${climate.target ?? "—"}°</span>`;

			const actions = document.createElement("div");
			actions.className = "ha-climate-actions";

			const minus = document.createElement("button");
			minus.type = "button";
			minus.className = "ha-btn";
			minus.textContent = "−";
			bindPress(minus, () => {
				const nextTemp = Math.max(climate.min ?? 16, Number(climate.target ?? 24) - 1);
				haClimateAction(climate.entity_id, "temp", nextTemp);
			});

			const plus = document.createElement("button");
			plus.type = "button";
			plus.className = "ha-btn";
			plus.textContent = "+";
			bindPress(plus, () => {
				const nextTemp = Math.min(climate.max ?? 30, Number(climate.target ?? 24) + 1);
				haClimateAction(climate.entity_id, "temp", nextTemp);
			});

			const power = document.createElement("button");
			power.type = "button";
			power.className = "ha-btn power" + (isOn ? " on" : "");
			power.textContent = isOn ? "關閉" : "開啟";
			bindPress(power, () => haClimateAction(climate.entity_id, "power"));

			actions.appendChild(minus);
			actions.appendChild(plus);
			actions.appendChild(power);

			card.appendChild(name);
			card.appendChild(mode);
			card.appendChild(temps);
			card.appendChild(actions);
			root.appendChild(card);
		}

		const grid = document.createElement("div");
		grid.className = "ha-grid";
		tiles.forEach((ent) => {
			const btn = document.createElement("button");
			btn.type = "button";
			const on = ent.state === "on";
			btn.className = "ha-tile" + (on ? " on" : "");
			btn.dataset.entity = ent.entity_id;

			const nm = document.createElement("span");
			nm.className = "ha-tile-name";
			nm.textContent = shortHaName(ent.name, ent.entity_id);

			const st = document.createElement("span");
			st.className = "ha-tile-state";
			st.textContent = ent.state === "unavailable" ? "離線" : on ? "開" : "關";

			btn.appendChild(nm);
			btn.appendChild(st);
			bindPress(btn, () => haToggle(ent.entity_id, btn));
			grid.appendChild(btn);
		});
		root.appendChild(grid);
	}

	async function haToggle (entityId, btn) {
		if (btn) btn.classList.add("busy");
		try {
			const data = await postJson("/api/ha/toggle", { entity: entityId });
			if (data?.entity) {
				haCache = haCache.map((e) => (e.entity_id === entityId ? data.entity : e));
				store.save("ha", { ok: true, entities: haCache });
				renderHa(haCache);
			} else {
				await refreshHa();
			}
		} catch (e) {
			console.warn("ha toggle", e);
			if (btn) btn.classList.remove("busy");
			if (haCache.length) renderHa(haCache);
		}
	}

	async function haClimateAction (entityId, action, temperature) {
		try {
			const body = { entity: entityId, action };
			if (action === "temp") body.temperature = temperature;
			const data = await postJson("/api/ha/climate", body);
			if (data?.entity) {
				haCache = haCache.map((e) => (e.entity_id === entityId ? data.entity : e));
				store.save("ha", { ok: true, entities: haCache });
				renderHa(haCache);
			} else {
				await refreshHa();
			}
		} catch (e) {
			console.warn("ha climate", e);
			if (haCache.length) renderHa(haCache);
		}
	}

	async function refreshHa () {
		try {
			const data = await getJson("/api/ha/states");
			const entities = Array.isArray(data.entities) ? data.entities : [];
			if (!entities.length && haCache.length) return;
			store.save("ha", { ok: true, entities });
			renderHa(entities);
		} catch (e) {
			console.warn("ha", e);
			const cached = store.get("ha");
			if (cached?.entities?.length) renderHa(cached.entities);
			else if (!haCache.length) $("haRoot").innerHTML = '<div class="dimmed">HA 連線失敗</div>';
		}
	}

	function hydrateFromCache () {
		const weather = store.get("weather");
		if (weather) applyWeather(weather);

		const dht = store.get("dht");
		if (dht) applyDht(dht);

		if (!shouldHideStorm()) {
			const storm = store.get("storm");
			if (storm) renderStorm(storm);
		} else {
			renderStorm({ active: false, storms: [] });
		}

		const calendar = store.get("calendar");
		if (calendar) applyCalendar(calendar);

		const ha = store.get("ha");
		if (ha?.entities?.length) renderHa(ha.entities);
	}

	tickClock();
	setInterval(tickClock, 1000);
	ensureFocusBrightness();
	hydrateFromCache();
	refreshWeather();
	refreshStorm();
	refreshDht();
	refreshCalendar();
	refreshHa();
	setInterval(refreshWeather, 5 * 60 * 1000);
	setInterval(refreshStorm, 10 * 60 * 1000);
	setInterval(refreshDht, 30 * 1000);
	setInterval(refreshCalendar, 15 * 60 * 1000);
	setInterval(refreshHa, 8 * 1000);
})();
