const gate = document.getElementById("gate");
const editor = document.getElementById("editor");
const gateForm = document.getElementById("gate-form");
const gatePassword = document.getElementById("gate-password");
const gateTitle = document.getElementById("gate-title");
const gateLede = document.getElementById("gate-lede");
const gateStatus = document.getElementById("gate-status");
const gateSubmit = document.getElementById("gate-submit");

const form = document.getElementById("env-form");
const statusEl = document.getElementById("status");
const btnSave = document.getElementById("btn-save");
const btnReload = document.getElementById("btn-reload");
const btnRestart = document.getElementById("btn-restart");
const btnLogout = document.getElementById("btn-logout");
const btnPassword = document.getElementById("btn-password");
const pwCurrent = document.getElementById("pw-current");
const pwNew = document.getElementById("pw-new");
const pwConfirm = document.getElementById("pw-confirm");
const pwStatus = document.getElementById("pw-status");

let fields = [];
let needsSetup = false;

function setGateStatus (msg, kind) {
	gateStatus.hidden = !msg;
	gateStatus.textContent = msg || "";
	gateStatus.className = `status ${kind || ""}`;
}

function setStatus (msg, kind) {
	statusEl.hidden = !msg;
	statusEl.textContent = msg || "";
	statusEl.className = `status ${kind || ""}`;
}

function setPwStatus (msg, kind) {
	pwStatus.hidden = !msg;
	pwStatus.textContent = msg || "";
	pwStatus.className = `status ${kind || ""}`;
}

function showGate (setup) {
	needsSetup = !!setup;
	gate.hidden = false;
	editor.hidden = true;
	gateTitle.textContent = setup ? "設定管理員密碼" : "管理員登入";
	gateLede.innerHTML = setup
		? "第一次使用，請設定進入 <code>/admin</code> 的密碼。"
		: "輸入密碼以編輯 <code>config.env</code>。";
	gateSubmit.textContent = setup ? "設定並進入" : "進入";
	gatePassword.value = "";
	gatePassword.focus();
}

function showEditor () {
	gate.hidden = true;
	editor.hidden = false;
}

function buildForm (meta, values) {
	form.innerHTML = "";
	fields = meta;
	const groups = new Map();
	for (const field of meta) {
		if (!groups.has(field.group)) groups.set(field.group, []);
		groups.get(field.group).push(field);
	}

	for (const [groupName, groupFields] of groups) {
		const section = document.createElement("section");
		section.className = "group";
		const h2 = document.createElement("h2");
		h2.textContent = groupName;
		section.appendChild(h2);

		for (const field of groupFields) {
			const wrap = document.createElement("div");
			wrap.className = "field";

			const label = document.createElement("label");
			label.htmlFor = field.key;
			label.innerHTML = `${field.label}<span class="key">${field.key}</span>`;
			wrap.appendChild(label);

			if (field.type === "password") {
				const row = document.createElement("div");
				row.className = "pw-row";
				const input = document.createElement("input");
				input.type = "password";
				input.id = field.key;
				input.name = field.key;
				input.autocomplete = "off";
				input.value = values[field.key] ?? "";
				const toggle = document.createElement("button");
				toggle.type = "button";
				toggle.className = "btn";
				toggle.textContent = "顯示";
				toggle.addEventListener("click", () => {
					const show = input.type === "password";
					input.type = show ? "text" : "password";
					toggle.textContent = show ? "隱藏" : "顯示";
				});
				row.append(input, toggle);
				wrap.appendChild(row);
			} else {
				const input = document.createElement("input");
				input.type = field.type === "color" ? "color" : "text";
				input.id = field.key;
				input.name = field.key;
				const val = values[field.key] ?? "";
				if (field.type === "color" && /^#[0-9a-fA-F]{6}$/.test(val)) {
					input.value = val;
				} else if (field.type === "color") {
					input.value = "#58a6ff";
				} else {
					input.value = val;
				}
				if (field.key === "UNIFI_PROTECT_CAMERA_NAMES") {
					input.readOnly = true;
					input.title = "請用下方勾選並以 ↑↓ 調整次序（最多 2 部）";
					input.placeholder = "請用下方勾選並以 ↑↓ 調整次序（最多 2 部）";
				}
				wrap.appendChild(input);
			}

			section.appendChild(wrap);
		}

		if (groupName === "UniFi Protect") {
			section.appendChild(buildCameraPicker(values));
		}

		form.appendChild(section);
	}
}

function buildCameraPicker (values) {
	const MAX_CAMERAS = 2;
	const box = document.createElement("div");
	box.className = "camera-picker";
	box.innerHTML = `
		<div class="camera-picker-head">
			<strong>攝影機</strong>
			<button type="button" class="btn" id="btn-fetch-cameras">從 Protect 提取</button>
		</div>
		<p class="camera-hint">可選 1～${MAX_CAMERAS} 部。下方「顯示次序」可用 ↑↓ 調整；第 1 部會先顯示。</p>
		<div class="camera-order-block">
			<strong class="camera-subhead">顯示次序</strong>
			<div id="camera-order" class="camera-order"></div>
		</div>
		<strong class="camera-subhead">可選清單</strong>
		<div id="camera-list" class="camera-list"></div>
		<p id="camera-status" class="status" hidden></p>
	`;

	const listEl = box.querySelector("#camera-list");
	const orderEl = box.querySelector("#camera-order");
	const statusCam = box.querySelector("#camera-status");
	/** @type {string[]} */
	let ordered = String(values.UNIFI_PROTECT_CAMERA_NAMES || "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, MAX_CAMERAS);
	/** @type {Array<{name: string, state?: string}>} */
	let catalog = [];

	function setCamStatus (msg, kind) {
		statusCam.hidden = !msg;
		statusCam.textContent = msg || "";
		statusCam.className = `status ${kind || ""}`;
	}

	function syncField () {
		const input = document.getElementById("UNIFI_PROTECT_CAMERA_NAMES");
		if (input) input.value = ordered.join(",");
	}

	function renderOrder () {
		orderEl.innerHTML = "";
		if (!ordered.length) {
			orderEl.innerHTML = "<p class=\"camera-empty\">尚未選取攝影機。</p>";
			return;
		}
		ordered.forEach((name, index) => {
			const row = document.createElement("div");
			row.className = "camera-order-row";

			const label = document.createElement("span");
			label.className = "camera-order-label";
			label.textContent = `${index + 1}. ${name}`;

			const actions = document.createElement("div");
			actions.className = "camera-order-actions";

			const btnUp = document.createElement("button");
			btnUp.type = "button";
			btnUp.className = "btn";
			btnUp.textContent = "↑";
			btnUp.title = "上移";
			btnUp.disabled = index === 0;
			btnUp.addEventListener("click", () => {
				if (index === 0) return;
				[ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]];
				refresh();
			});

			const btnDown = document.createElement("button");
			btnDown.type = "button";
			btnDown.className = "btn";
			btnDown.textContent = "↓";
			btnDown.title = "下移";
			btnDown.disabled = index === ordered.length - 1;
			btnDown.addEventListener("click", () => {
				if (index >= ordered.length - 1) return;
				[ordered[index + 1], ordered[index]] = [ordered[index], ordered[index + 1]];
				refresh();
			});

			const btnRemove = document.createElement("button");
			btnRemove.type = "button";
			btnRemove.className = "btn";
			btnRemove.textContent = "移除";
			btnRemove.addEventListener("click", () => {
				ordered = ordered.filter((n) => n !== name);
				refresh();
			});

			actions.append(btnUp, btnDown, btnRemove);
			row.append(label, actions);
			orderEl.appendChild(row);
		});
	}

	function renderList () {
		listEl.innerHTML = "";
		if (!catalog.length) {
			listEl.innerHTML = "<p class=\"camera-empty\">尚未提取，或 Protect 沒有攝影機。</p>";
			return;
		}
		const atLimit = ordered.length >= MAX_CAMERAS;
		for (const cam of catalog) {
			const row = document.createElement("label");
			row.className = "camera-row";
			const cb = document.createElement("input");
			cb.type = "checkbox";
			cb.value = cam.name;
			const isSelected = ordered.includes(cam.name);
			cb.checked = isSelected;
			const locked = atLimit && !isSelected;
			cb.disabled = locked;
			row.classList.toggle("is-locked", locked);
			cb.addEventListener("change", () => {
				if (cb.checked) {
					if (ordered.length >= MAX_CAMERAS) {
						cb.checked = false;
						setCamStatus(`最多只能選擇 ${MAX_CAMERAS} 部攝影機`, "err");
						return;
					}
					if (!ordered.includes(cam.name)) ordered.push(cam.name);
				} else {
					ordered = ordered.filter((n) => n !== cam.name);
				}
				refresh();
			});
			const text = document.createElement("span");
			text.textContent = cam.name + (cam.state ? ` （${cam.state}）` : "");
			row.append(cb, text);
			listEl.appendChild(row);
		}
	}

	function refresh () {
		ordered = ordered.slice(0, MAX_CAMERAS);
		syncField();
		renderOrder();
		renderList();
		if (ordered.length) {
			setCamStatus(
				`目前次序：${ordered.map((n, i) => `${i + 1}.${n}`).join(" → ")}（記得按下方儲存）`,
				"ok"
			);
		} else if (catalog.length) {
			setCamStatus(`尚未勾選（最多 ${MAX_CAMERAS} 部）`, "");
		}
	}

	box.querySelector("#btn-fetch-cameras").addEventListener("click", async () => {
		setCamStatus("正在登入 Protect 並提取攝影機…");
		try {
			const res = await fetch("api/unifi/cameras", {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					host: document.getElementById("UNIFI_PROTECT_HOST")?.value,
					username: document.getElementById("UNIFI_PROTECT_USERNAME")?.value,
					password: document.getElementById("UNIFI_PROTECT_PASSWORD")?.value,
					selectedNames: document.getElementById("UNIFI_PROTECT_CAMERA_NAMES")?.value
				})
			});
			const data = await res.json();
			if (res.status === 401 || data.needLogin) {
				showGate(false);
				throw new Error("登入已過期");
			}
			if (!data.ok) throw new Error(data.error || "提取失敗");
			catalog = data.cameras || [];
			const known = new Set(catalog.map((c) => c.name));
			// Keep current order; drop names Protect no longer has
			ordered = ordered.filter((n) => known.has(n)).slice(0, MAX_CAMERAS);
			refresh();
			if (!ordered.length) {
				setCamStatus(`找到 ${catalog.length} 部攝影機（最多選 ${MAX_CAMERAS} 部）`, "ok");
			}
		} catch (err) {
			setCamStatus(err.message, "err");
		}
	});

	renderOrder();
	syncField();
	return box;
}

function collectValues () {
	const data = {};
	for (const field of fields) {
		const el = document.getElementById(field.key);
		data[field.key] = el ? el.value : "";
	}
	return data;
}

async function loadEnv () {
	setStatus("載入中…");
	const res = await fetch("api/env", { credentials: "same-origin" });
	const data = await res.json();
	if (res.status === 401 || data.needLogin) {
		showGate(false);
		throw new Error("請先登入");
	}
	if (!data.ok) throw new Error(data.error || "載入失敗");
	buildForm(data.fields, data.values || {});
	setStatus(`已載入（${data.path}）`, "ok");
}

async function saveEnv () {
	const body = collectValues();
	const res = await fetch("api/env", {
		method: "POST",
		credentials: "same-origin",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	});
	const data = await res.json();
	if (res.status === 401 || data.needLogin) {
		showGate(false);
		throw new Error("登入已過期");
	}
	if (!data.ok) throw new Error(data.error || "儲存失敗");
	return data;
}

async function boot () {
	const res = await fetch("api/status", { credentials: "same-origin" });
	const data = await res.json();
	if (!data.ok) throw new Error(data.error || "無法取得狀態");
	if (data.needsSetup) {
		showGate(true);
		return;
	}
	if (!data.authenticated) {
		showGate(false);
		return;
	}
	showEditor();
	await loadEnv();
}

gateForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	gateSubmit.disabled = true;
	setGateStatus(needsSetup ? "設定中…" : "登入中…");
	try {
		const password = gatePassword.value;
		const endpoint = needsSetup ? "api/setup" : "api/login";
		const res = await fetch(endpoint, {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password })
		});
		const data = await res.json();
		if (!data.ok) throw new Error(data.error || "失敗");
		showEditor();
		await loadEnv();
		setGateStatus("");
	} catch (err) {
		setGateStatus(err.message, "err");
	} finally {
		gateSubmit.disabled = false;
	}
});

btnSave.addEventListener("click", async () => {
	btnSave.disabled = true;
	try {
		const data = await saveEnv();
		setStatus(`已儲存 ${data.saved} 個欄位。請重啟 MagicMirror 以套用。`, "ok");
	} catch (err) {
		setStatus(err.message, "err");
	} finally {
		btnSave.disabled = false;
	}
});

btnReload.addEventListener("click", () => {
	loadEnv().catch((err) => setStatus(err.message, "err"));
});

btnRestart.addEventListener("click", async () => {
	btnRestart.disabled = true;
	try {
		await saveEnv();
		setStatus("已儲存，正在重啟 MagicMirror…", "ok");
		await fetch("api/restart", { method: "POST", credentials: "same-origin" });
	} catch (err) {
		setStatus(err.message, "err");
		btnRestart.disabled = false;
	}
});

btnLogout.addEventListener("click", async () => {
	await fetch("api/logout", { method: "POST", credentials: "same-origin" });
	showGate(false);
	setGateStatus("已登出", "ok");
});

btnPassword.addEventListener("click", async () => {
	btnPassword.disabled = true;
	setPwStatus("變更中…");
	try {
		const currentPassword = pwCurrent.value;
		const newPassword = pwNew.value;
		const confirm = pwConfirm.value;
		if (newPassword.length < 4) throw new Error("新密碼至少 4 個字元");
		if (newPassword !== confirm) throw new Error("兩次新密碼不一致");
		const res = await fetch("api/password", {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ currentPassword, newPassword })
		});
		const data = await res.json();
		if (res.status === 401 && data.needLogin) {
			showGate(false);
			throw new Error("登入已過期");
		}
		if (!data.ok) throw new Error(data.error || "變更失敗");
		pwCurrent.value = "";
		pwNew.value = "";
		pwConfirm.value = "";
		setPwStatus("密碼已更新（已以雜湊儲存）", "ok");
	} catch (err) {
		setPwStatus(err.message, "err");
	} finally {
		btnPassword.disabled = false;
	}
});

boot().catch((err) => setGateStatus(err.message, "err"));
