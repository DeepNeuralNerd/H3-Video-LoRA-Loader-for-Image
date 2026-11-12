import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";

const NODE_ID = "H3VideoLoraStackForImage";
const style = document.createElement("style");
style.textContent = `
.h3-lora-stack { box-sizing:border-box; width:100%; min-width:410px; padding:8px; color:var(--fg-color,#eee); font:12px system-ui,sans-serif; }
.h3-lora-stack * { box-sizing:border-box; }
.h3-lora-head,.h3-lora-row { display:flex; align-items:center; gap:6px; }
.h3-lora-head { padding-bottom:8px; border-bottom:1px solid #6667; margin-bottom:7px; }
.h3-lora-title { flex:1; font-weight:600; }
.h3-lora-row { margin:4px 0; padding:5px; background:#ffffff0d; border:1px solid #ffffff20; border-radius:6px; }
.h3-lora-row.off { opacity:.5; }
.h3-lora-row.drag-over { outline:2px solid #7cb7ff; }
.h3-lora-grip { cursor:grab; opacity:.75; user-select:none; }
.h3-lora-file { min-width:0; flex:1; height:26px; padding:3px 6px; color:inherit; background:#1118; border:1px solid #8887; border-radius:4px; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; }
.h3-lora-strength { width:58px; height:26px; padding:3px; text-align:center; color:inherit; background:#1118; border:1px solid #8887; border-radius:4px; }
.h3-lora-button { height:26px; min-width:26px; padding:2px 7px; color:inherit; background:#ffffff18; border:1px solid #8887; border-radius:4px; cursor:pointer; }
.h3-lora-button:hover { background:#ffffff30; }
.h3-lora-toggle { accent-color:#7cb7ff; margin:0 2px; }
.h3-lora-empty { padding:10px 4px; opacity:.65; text-align:center; }
.h3-lora-picker { padding:8px; margin-top:7px; border:1px solid #8888; border-radius:6px; background:#181c25; }
.h3-lora-search { width:100%; height:27px; padding:3px 6px; color:inherit; background:#1118; border:1px solid #8887; border-radius:4px; }
.h3-lora-list { max-height:185px; overflow:auto; margin-top:6px; }
.h3-lora-choice { display:flex; align-items:center; gap:7px; width:100%; padding:4px; text-align:left; color:inherit; background:transparent; border:0; cursor:pointer; overflow-wrap:anywhere; }
.h3-lora-choice:hover { background:#ffffff24; }
.h3-lora-actions { display:flex; justify-content:flex-end; gap:6px; margin-top:7px; }
.h3-lora-detail { padding:8px; margin:4px 0 8px; border:1px solid #8888; border-radius:6px; background:#181c25; overflow-wrap:anywhere; }
.h3-lora-detail pre { max-height:180px; overflow:auto; white-space:pre-wrap; font-size:11px; }
`;
document.head.append(style);

let fileNames = [];
function matchingNames(names, words) {
  const normalize = (text) => text.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const terms = normalize(words).split(/\s+/).filter(Boolean);
  return names.filter((name) => {
    const path = normalize(name);
    const compact = path.replace(/\s/g, "");
    return terms.every((term) => path.includes(term) || compact.includes(term));
  });
}

function formatMetadata(data) {
  const labels = {
    name: "Embedded name",
    ss_output_name: "Training output name",
    ss_base_model_version: "Base model",
    training_info: "Training info",
    software: "Training software",
  };
  return Object.entries(data).map(([key, raw]) => {
    let value = raw;
    if (typeof value === "string" && /^[{\[]/.test(value.trim())) {
      try { value = JSON.parse(value); } catch { /* Keep the original metadata. */ }
    }
    return `${labels[key] ?? key}: ${typeof value === "object" ? JSON.stringify(value, null, 2) : value}`;
  }).join("\n\n");
}

async function refreshFiles() {
  try {
    const response = await api.fetchApi("/object_info/LoraLoaderModelOnly");
    const data = await response.json();
    fileNames = data.LoraLoaderModelOnly?.input?.required?.lora_name?.[0] ?? [];
  } catch (error) {
    console.warn("H3 Image LoRA Stack: could not refresh LoRA list", error);
  }
}

function readRows(value) {
  try {
    const rows = JSON.parse(value);
    if (Array.isArray(rows)) return rows.filter((row) => row && typeof row === "object").map((row) => ({
      enabled: row.enabled !== false,
      name: typeof row.name === "string" ? row.name : "",
      strength: Number.isFinite(Number(row.strength)) ? Number(row.strength) : 1,
    }));
  } catch { /* Empty or older storage value. */ }
  return [];
}

function mount(node) {
  const storage = node.widgets?.find((widget) => widget.name === "loras");
  if (!storage) return;
  storage.options = { ...storage.options, hidden: true };
  storage.computeSize = () => [0, -4];
  storage.computeLayoutSize = () => ({ minWidth: 0, minHeight: 0 });
  storage.draw = () => {};

  const panel = document.createElement("div");
  panel.className = "h3-lora-stack";
  let rows = readRows(storage.value);
  let pickerOpen = false;
  let replaceIndex = -1;
  let selected = new Set();
  let query = "";
  let remembered = null;
  let templateOpen = false;
  let menuIndex = -1;
  let infoRow = null;
  let infoName = "";
  let infoData = null;
  const createdAt = performance.now();
  let escapePicker = null;
  const templateKey = "h3-image-lora-stack-templates";
  const save = () => {
    storage.value = JSON.stringify(rows);
    node.setDirtyCanvas(true, true);
    app.graph?.change();
  };
  const infoOpen = () => infoRow && rows.includes(infoRow) && infoRow.name === infoName;
  const resize = () => node.setSize([Math.max(node.size[0], 430), 145 + rows.length * 39 + (pickerOpen ? 280 : 0) + (templateOpen ? 110 : 0) + (menuIndex >= 0 ? 80 : 0) + (infoOpen() ? 160 : 0)]);

  const control = (label, title, action) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "h3-lora-button";
    item.textContent = label;
    item.title = title;
    item.onclick = action;
    return item;
  };

  async function openPicker(index = -1) {
    // ComfyUI can deliver the node-creation click to the new DOM widget.
    if (performance.now() - createdAt < 350) return;
    replaceIndex = index;
    selected = new Set();
    query = "";
    pickerOpen = true;
    templateOpen = false;
    if (!escapePicker) {
      escapePicker = (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closePicker();
      };
      window.addEventListener("keydown", escapePicker, true);
    }
    draw();
    await refreshFiles();
    if (!pickerOpen) return;
    draw();
    panel.querySelector(".h3-lora-search")?.focus();
  }

  function closePicker() {
    pickerOpen = false;
    if (escapePicker) window.removeEventListener("keydown", escapePicker, true);
    escapePicker = null;
    draw();
  }

  async function showInfo(index) {
    menuIndex = -1;
    const row = rows[index];
    if (!row?.name) return;
    infoRow = row;
    infoName = row.name;
    infoData = undefined;
    draw();
    let data = null;
    try {
      const response = await api.fetchApi(`/view_metadata/loras?filename=${encodeURIComponent(infoName)}`);
      if (response.ok) data = await response.json();
    } catch (error) { console.warn("H3 Image LoRA Stack: metadata unavailable", error); }
    if (infoRow === row && infoOpen()) { infoData = data; draw(); }
  }

  function drawPicker() {
    const box = document.createElement("div");
    box.className = "h3-lora-picker";
    const search = document.createElement("input");
    search.type = "text";
    search.className = "h3-lora-search";
    search.placeholder = "Type words in any order, e.g. h3 realism";
    search.value = query;
    const status = document.createElement("div");
    status.className = "h3-lora-empty";
    status.style.padding = "4px";
    const list = document.createElement("div");
    list.className = "h3-lora-list";
    let addButton;
    const fill = () => {
      list.replaceChildren();
      const matches = matchingNames(fileNames, query);
      status.textContent = `${matches.length} matches · ${selected.size} selected`;
      if (addButton) addButton.textContent = replaceIndex < 0 ? `Add ${selected.size} LoRA${selected.size === 1 ? "" : "s"}` : "Replace";
      for (const name of matches.slice(0, 200)) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "h3-lora-choice";
        const check = document.createElement("input");
        check.type = replaceIndex < 0 ? "checkbox" : "radio";
        check.checked = selected.has(name);
        check.tabIndex = -1;
        const text = document.createElement("span");
        text.textContent = name;
        item.append(check, text);
        item.onclick = () => {
          if (replaceIndex >= 0) selected = new Set([name]);
          else if (selected.has(name)) selected.delete(name);
          else selected.add(name);
          fill();
        };
        list.append(item);
      }
      if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "h3-lora-empty";
        empty.textContent = "No matching LoRAs";
        list.append(empty);
      }
    };
    search.oninput = () => { query = search.value; fill(); };
    search.onkeydown = (event) => {
      if (event.key === "Enter" && selected.size && addButton) { event.preventDefault(); addButton.click(); }
    };
    fill();
    const actions = document.createElement("div");
    actions.className = "h3-lora-actions";
    addButton = control("Add 0 LoRAs", "Apply selected LoRAs", () => {
      if (!selected.size) return;
      if (replaceIndex >= 0) rows[replaceIndex].name = [...selected][0];
      else for (const name of selected) rows.push({ enabled: true, name, strength: 1 });
      pickerOpen = false;
      if (escapePicker) window.removeEventListener("keydown", escapePicker, true);
      escapePicker = null;
      save(); draw();
    });
    addButton.textContent = replaceIndex < 0 ? "Add 0 LoRAs" : "Replace";
    actions.append(
      control("Cancel", "Close picker", closePicker),
      addButton,
    );
    box.append(search, status, list, actions);
    return box;
  }

  function draw() {
    panel.replaceChildren();

    const head = document.createElement("div");
    head.className = "h3-lora-head";
    head.append(control("▤", "Save or load a stack template", () => {
      if (pickerOpen) closePicker();
      templateOpen = !templateOpen;
      draw();
    }));
    const all = document.createElement("input");
    all.type = "checkbox";
    all.className = "h3-lora-toggle";
    all.title = "Turn the stack off and back on, restoring your row selections";
    all.checked = rows.length > 0 && rows.every((row) => row.enabled);
    all.indeterminate = rows.some((row) => row.enabled) && !all.checked;
    all.onchange = () => {
      if (rows.some((row) => row.enabled)) {
        remembered = rows.map((row) => row.enabled);
        rows.forEach((row) => { row.enabled = false; });
      } else {
        rows.forEach((row, index) => { row.enabled = remembered?.[index] ?? true; });
        remembered = null;
      }
      save(); draw();
    };
    const title = document.createElement("span");
    title.className = "h3-lora-title";
    title.textContent = `H3 image LoRAs (${rows.filter((row) => row.enabled).length}/${rows.length})`;
    const add = document.createElement("button");
    add.type = "button";
    add.className = "h3-lora-button";
    add.textContent = "+ LoRA";
    add.onclick = () => openPicker();
    head.append(all, title, control("↻", "Refresh LoRA files", async () => { await refreshFiles(); draw(); }), add);
    panel.append(head);

    if (templateOpen) {
      const box = document.createElement("div");
      box.className = "h3-lora-picker";
      const name = document.createElement("input");
      name.className = "h3-lora-search";
      name.placeholder = "Template name";
      const saved = JSON.parse(localStorage.getItem(templateKey) || "{}");
      box.append(name, control("Save stack", "Save rows in this browser", () => {
        if (!name.value.trim()) return;
        saved[name.value.trim()] = rows.map((row) => ({ ...row }));
        localStorage.setItem(templateKey, JSON.stringify(saved)); draw();
      }));
      for (const key of Object.keys(saved).sort()) {
        const line = document.createElement("div");
        line.className = "h3-lora-row";
        const label = document.createElement("span");
        label.className = "h3-lora-title";
        label.textContent = key;
        line.append(label, control("Load", `Load ${key}`, () => { rows = readRows(JSON.stringify(saved[key])); templateOpen = false; save(); draw(); }));
        line.append(control("×", `Delete ${key}`, () => { delete saved[key]; localStorage.setItem(templateKey, JSON.stringify(saved)); draw(); }));
        box.append(line);
      }
      panel.append(box);
    }

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "h3-lora-empty";
      empty.textContent = "Add a video LoRA to filter for H3-Image";
      panel.append(empty);
    }

    rows.forEach((row, index) => {
      const line = document.createElement("div");
      line.className = `h3-lora-row${row.enabled ? "" : " off"}`;
      line.oncontextmenu = (event) => {
        event.preventDefault();
        menuIndex = menuIndex === index ? -1 : index;
        infoRow = null;
        draw();
      };
      line.ondragover = (event) => { event.preventDefault(); line.classList.add("drag-over"); };
      line.ondragleave = () => line.classList.remove("drag-over");
      line.ondrop = (event) => {
        event.preventDefault(); line.classList.remove("drag-over");
        const from = Number(event.dataTransfer.getData("text/plain"));
        if (!Number.isInteger(from) || from < 0 || from >= rows.length || from === index) return;
        const [moved] = rows.splice(from, 1);
        rows.splice(from < index ? index - 1 : index, 0, moved);
        save(); draw();
      };
      const grip = document.createElement("span");
      grip.className = "h3-lora-grip";
      grip.textContent = "⋮⋮";
      grip.title = "Drag to reorder";
      grip.draggable = true;
      grip.ondragstart = (event) => { event.dataTransfer.setData("text/plain", String(index)); event.dataTransfer.effectAllowed = "move"; };
      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.className = "h3-lora-toggle";
      enabled.checked = row.enabled;
      enabled.title = "Enable this LoRA";
      enabled.onchange = () => { row.enabled = enabled.checked; remembered = null; save(); draw(); };
      const file = document.createElement("button");
      file.type = "button";
      file.className = "h3-lora-file";
      file.textContent = row.name.split(/[\\/]/).pop() || "Choose LoRA…";
      file.title = row.name || "Choose LoRA";
      const scale = Math.max(1, ...rows.filter((entry) => entry.enabled).map((entry) => Math.abs(entry.strength)));
      const extent = Math.min(50, Math.abs(row.strength) / scale * 50);
      file.style.background = row.strength >= 0
        ? `linear-gradient(90deg, #1118 50%, #388f8f88 50%, #388f8f88 ${50 + extent}%, #1118 ${50 + extent}%)`
        : `linear-gradient(90deg, #1118 ${50 - extent}%, #ab666688 ${50 - extent}%, #ab666688 50%, #1118 50%)`;
      let scrub = null;
      let scrubbed = false;
      file.onpointerdown = (event) => {
        if (event.button !== 0) return;
        scrub = { x: event.clientX, value: row.strength };
        scrubbed = false;
        file.setPointerCapture(event.pointerId);
      };
      file.onpointermove = (event) => {
        if (!scrub) return;
        const distance = event.clientX - scrub.x;
        if (Math.abs(distance) < 5 && !scrubbed) return;
        scrubbed = true;
        const step = event.shiftKey ? 0.01 : 0.05;
        row.strength = Math.round((scrub.value + Math.trunc(distance / 8) * step) * 100) / 100;
        strength.value = String(row.strength);
      };
      file.onpointerup = () => { if (scrubbed) save(); scrub = null; };
      file.onclick = () => { if (!scrubbed) openPicker(index); };
      const strength = document.createElement("input");
      strength.type = "number";
      strength.className = "h3-lora-strength";
      strength.min = "-100";
      strength.max = "100";
      strength.step = "0.05";
      strength.value = String(row.strength);
      strength.title = "Model strength";
      strength.onchange = () => { const value = Number(strength.value); if (Number.isFinite(value)) { row.strength = value; save(); draw(); } };
      const nudge = (amount) => { row.strength = Math.round((row.strength + amount) * 100) / 100; save(); draw(); };
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "h3-lora-button";
      remove.title = "Remove row";
      remove.textContent = "×";
      remove.onclick = () => { rows.splice(index, 1); save(); draw(); };
      line.append(grip, enabled, file,
        control("−", "Decrease strength by 0.05", () => nudge(-0.05)),
        strength,
        control("+", "Increase strength by 0.05", () => nudge(0.05)),
        control("i", "Show embedded LoRA metadata", () => showInfo(index)),
        remove);
      panel.append(line);
      if (menuIndex === index) {
        const menu = document.createElement("div");
        menu.className = "h3-lora-detail h3-lora-actions";
        const move = (direction) => {
          const next = index + direction;
          if (next < 0 || next >= rows.length) return;
          [rows[index], rows[next]] = [rows[next], rows[index]];
          menuIndex = -1; save(); draw();
        };
        menu.append(
          control("↑", "Move row up", () => move(-1)),
          control("↓", "Move row down", () => move(1)),
          control("Duplicate", "Copy this LoRA row", () => { rows.splice(index + 1, 0, { ...row }); menuIndex = -1; save(); draw(); }),
          control(row.enabled ? "Disable" : "Enable", "Toggle this LoRA", () => { row.enabled = !row.enabled; menuIndex = -1; save(); draw(); }),
          control("Close", "Close row actions", () => { menuIndex = -1; draw(); }),
        );
        panel.append(menu);
      }
      if (infoRow === row && infoOpen()) {
        const detail = document.createElement("div");
        detail.className = "h3-lora-detail";
        const heading = document.createElement("strong");
        heading.textContent = row.name || "No LoRA selected";
        const body = document.createElement("pre");
        body.textContent = infoData === undefined ? "Loading metadata…" : infoData && Object.keys(infoData).length
          ? `Embedded file metadata (may differ from filename; not a compatibility check):\n\n${formatMetadata(infoData)}`
          : "No embedded safetensors metadata found.";
        detail.append(heading, body, control("Close", "Close LoRA info", () => { infoRow = null; draw(); }));
        panel.append(detail);
      }
    });
    if (pickerOpen) panel.append(drawPicker());
    resize();
  }

  node.addDOMWidget("h3_lora_rows", "h3_lora_rows", panel, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => 80 + rows.length * 39 + (pickerOpen ? 280 : 0) + (templateOpen ? 110 : 0) + (menuIndex >= 0 ? 80 : 0) + (infoOpen() ? 160 : 0),
  }).serialize = false;
  const originalConfigure = node.onConfigure;
  node.onConfigure = function (...args) {
    originalConfigure?.apply(this, args);
    if (escapePicker) window.removeEventListener("keydown", escapePicker, true);
    escapePicker = null;
    pickerOpen = false;
    rows = readRows(storage.value);
    infoRow = null;
    draw();
  };
  const originalRemoved = node.onRemoved;
  node.onRemoved = function (...args) {
    if (escapePicker) window.removeEventListener("keydown", escapePicker, true);
    originalRemoved?.apply(this, args);
  };
  refreshFiles().then(draw);
  draw();
}

app.registerExtension({
  name: "DeepNeuralNerd.H3ImageLoRAStack",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== NODE_ID) return;
    const originalCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function (...args) {
      originalCreated?.apply(this, args);
      mount(this);
    };
  },
});
