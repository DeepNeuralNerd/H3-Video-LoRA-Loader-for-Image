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
.h3-lora-file { min-width:0; flex:1; height:26px; padding:3px 6px; color:inherit; background:#1118; border:1px solid #8887; border-radius:4px; }
.h3-lora-strength { width:58px; height:26px; padding:3px; text-align:center; color:inherit; background:#1118; border:1px solid #8887; border-radius:4px; }
.h3-lora-button { height:26px; min-width:26px; padding:2px 7px; color:inherit; background:#ffffff18; border:1px solid #8887; border-radius:4px; cursor:pointer; }
.h3-lora-button:hover { background:#ffffff30; }
.h3-lora-toggle { accent-color:#7cb7ff; margin:0 2px; }
.h3-lora-empty { padding:10px 4px; opacity:.65; text-align:center; }
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
  const listId = `h3-lora-files-${node.id}`;
  const choices = document.createElement("datalist");
  choices.id = listId;
  panel.append(choices);

  let rows = readRows(storage.value);
  const save = () => {
    storage.value = JSON.stringify(rows);
    node.setDirtyCanvas(true, true);
    app.graph?.change();
  };
  const resize = () => node.setSize([Math.max(node.size[0], 330), Math.max(170, 145 + rows.length * 39)]);

  function draw() {
    panel.replaceChildren(choices);
    choices.replaceChildren(...fileNames.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      return option;
    }));

    const head = document.createElement("div");
    head.className = "h3-lora-head";
    const all = document.createElement("input");
    all.type = "checkbox";
    all.className = "h3-lora-toggle";
    all.title = "Enable or disable all LoRAs";
    all.checked = rows.length > 0 && rows.every((row) => row.enabled);
    all.indeterminate = rows.some((row) => row.enabled) && !all.checked;
    all.onchange = () => { rows.forEach((row) => { row.enabled = all.checked; }); save(); draw(); };
    const title = document.createElement("span");
    title.className = "h3-lora-title";
    title.textContent = `H3 image LoRAs (${rows.filter((row) => row.enabled).length}/${rows.length})`;
    const add = document.createElement("button");
    add.type = "button";
    add.className = "h3-lora-button";
    add.textContent = "+ LoRA";
    add.onclick = () => { rows.push({ enabled: true, name: "", strength: 1 }); save(); draw(); };
    head.append(all, title, add);
    panel.append(head);

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "h3-lora-empty";
      empty.textContent = "Add a video LoRA to filter for H3-Image";
      panel.append(empty);
    }

    rows.forEach((row, index) => {
      const line = document.createElement("div");
      line.className = `h3-lora-row${row.enabled ? "" : " off"}`;
      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.className = "h3-lora-toggle";
      enabled.checked = row.enabled;
      enabled.title = "Enable this LoRA";
      enabled.onchange = () => { row.enabled = enabled.checked; save(); draw(); };
      const file = document.createElement("input");
      file.type = "text";
      file.className = "h3-lora-file";
      file.setAttribute("list", listId);
      file.placeholder = "Search LoRA file";
      file.value = row.name;
      file.style.background = `linear-gradient(90deg, #5b9bd655 ${Math.min(100, Math.abs(row.strength) * 50)}%, #1118 0)`;
      file.onchange = () => { row.name = file.value; save(); };
      const strength = document.createElement("input");
      strength.type = "number";
      strength.className = "h3-lora-strength";
      strength.min = "-100";
      strength.max = "100";
      strength.step = "0.05";
      strength.value = String(row.strength);
      strength.title = "Model strength";
      strength.onchange = () => { row.strength = Number(strength.value); save(); };
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "h3-lora-button";
      remove.title = "Remove row";
      remove.textContent = "×";
      remove.onclick = () => { rows.splice(index, 1); save(); draw(); };
      line.append(enabled, file, strength, remove);
      panel.append(line);
    });
    resize();
  }

  node.addDOMWidget("h3_lora_rows", "h3_lora_rows", panel, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => 80 + rows.length * 39,
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
