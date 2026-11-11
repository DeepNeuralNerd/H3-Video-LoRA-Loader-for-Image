import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";

const NODE_ID = "H3VideoLoraStackForImage";
const style = document.createElement("style");
style.textContent = `
.h3-lora-stack { box-sizing:border-box; width:100%; min-width:310px; padding:8px; color:var(--fg-color,#eee); font:12px system-ui,sans-serif; }
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
`;
document.head.append(style);

let fileNames = [];
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
  const templateKey = "h3-image-lora-stack-templates";
  const save = () => {
    storage.value = JSON.stringify(rows);
    node.setDirtyCanvas(true, true);
    app.graph?.change();
  };
  const resize = () => node.setSize([Math.max(node.size[0], 350), 145 + rows.length * 39 + (pickerOpen ? 280 : 0) + (templateOpen ? 110 : 0)]);

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
    replaceIndex = index;
    selected = new Set();
    query = "";
    pickerOpen = true;
    templateOpen = false;
    draw();
    await refreshFiles();
    draw();
    panel.querySelector(".h3-lora-search")?.focus();
  }

  function drawPicker() {
    const box = document.createElement("div");
    box.className = "h3-lora-picker";
    const search = document.createElement("input");
    search.type = "text";
    search.className = "h3-lora-search";
    search.placeholder = replaceIndex < 0 ? "Search and select LoRAs" : "Search replacement LoRA";
    search.value = query;
    const list = document.createElement("div");
    list.className = "h3-lora-list";
    const fill = () => {
      list.replaceChildren();
      const matches = fileNames.filter((name) => name.toLowerCase().includes(query.toLowerCase()));
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
    search.onkeydown = (event) => { if (event.key === "Escape") { pickerOpen = false; draw(); } };
    fill();
    const actions = document.createElement("div");
    actions.className = "h3-lora-actions";
    actions.append(
      control("Cancel", "Close picker", () => { pickerOpen = false; draw(); }),
      control(replaceIndex < 0 ? `Add ${selected.size || "selected"}` : "Replace", "Apply selected LoRAs", () => {
        if (!selected.size) return;
        if (replaceIndex >= 0) rows[replaceIndex].name = [...selected][0];
        else for (const name of selected) rows.push({ enabled: true, name, strength: 1 });
        pickerOpen = false; save(); draw();
      }),
    );
    box.append(search, list, actions);
    return box;
  }

  function draw() {
    panel.replaceChildren();

    const head = document.createElement("div");
    head.className = "h3-lora-head";
    head.append(control("▤", "Save or load a stack template", () => { templateOpen = !templateOpen; pickerOpen = false; draw(); }));
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
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "h3-lora-button";
      remove.title = "Remove row";
      remove.textContent = "×";
      remove.onclick = () => { rows.splice(index, 1); save(); draw(); };
      line.append(grip, enabled, file, strength, remove);
      panel.append(line);
    });
    if (pickerOpen) panel.append(drawPicker());
    resize();
  }

  node.addDOMWidget("h3_lora_rows", "h3_lora_rows", panel, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => 80 + rows.length * 39 + (pickerOpen ? 280 : 0) + (templateOpen ? 110 : 0),
  }).serialize = false;
  const originalConfigure = node.onConfigure;
  node.onConfigure = function (...args) {
    originalConfigure?.apply(this, args);
    rows = readRows(storage.value);
    draw();
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
