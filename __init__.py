"""Load H3 video LoRAs on H3-Image without incompatible output patches."""

import logging
import json
import re

import comfy.model_base
import comfy.sd
import comfy.utils
import folder_paths
from comfy_api.latest import ComfyExtension, io

WEB_DIRECTORY = "./web"

_UNSUPPORTED = re.compile(
    r"(?:^|[._])(?:audio[._]patch[._]proj|final[._]layer[._](?:audio[._]out|video[._]out))(?:[._]|$)"
)


def _apply_filtered_lora(model, name, strength):
    path = folder_paths.get_full_path_or_raise("loras", name)
    lora, metadata = comfy.utils.load_torch_file(path, safe_load=True, return_metadata=True)
    filtered = {key: value for key, value in lora.items() if not _UNSUPPORTED.search(key)}
    patched, _ = comfy.sd.load_lora_for_models(
        model, None, filtered, strength, 0, lora_metadata=metadata
    )
    return patched, len(filtered), len(lora) - len(filtered)


def _require_h3_image(model):
    if not isinstance(model.model, comfy.model_base.MiniMaxH3Image):
        raise ValueError("This loader requires a MiniMax H3-Image diffusion model.")


class H3VideoLoraForImage(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="H3VideoLoraForImage",
            display_name="H3 Video LoRA for H3 Image",
            category="model/loaders/minimax",
            description="Loads a MiniMax H3 video LoRA into H3-Image, omitting audio and incompatible final output patches.",
            inputs=[
                io.Model.Input("model"),
                io.Combo.Input("lora_name", options=folder_paths.get_filename_list("loras")),
                io.Float.Input("strength_model", default=1.0, min=-100.0, max=100.0, step=0.01),
            ],
            outputs=[io.Model.Output(), io.String.Output()],
        )

    @classmethod
    def execute(cls, model, lora_name, strength_model) -> io.NodeOutput:
        _require_h3_image(model)
        if strength_model == 0:
            return io.NodeOutput(model, "LoRA strength is zero; no patches applied.")

        patched, kept, removed = _apply_filtered_lora(model, lora_name, strength_model)
        report = f"Kept {kept} LoRA entries; removed {removed} audio/output entries."
        logging.info("H3 Image LoRA %s: %s", lora_name, report)
        return io.NodeOutput(patched, report)


class H3VideoLoraStackForImage(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="H3VideoLoraStackForImage",
            display_name="H3 Image LoRA Stack",
            category="model/loaders/minimax",
            description="Apply several H3 video LoRAs to H3-Image, filtering incompatible patches from each.",
            inputs=[
                io.Model.Input("model"),
                io.String.Input("loras", default="[]", multiline=True),
            ],
            outputs=[io.Model.Output(), io.String.Output()],
        )

    @classmethod
    def execute(cls, model, loras) -> io.NodeOutput:
        _require_h3_image(model)
        try:
            rows = json.loads(loras)
        except (TypeError, ValueError) as exc:
            raise ValueError("Invalid LoRA stack data.") from exc
        if not isinstance(rows, list):
            raise ValueError("LoRA stack must be a list.")
        reports = []
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("Each LoRA row must be an object.")
            if not row.get("enabled", True):
                continue
            name = row.get("name")
            if not isinstance(name, str) or not name:
                raise ValueError("An enabled LoRA row has no file selected.")
            strength = float(row.get("strength", 1.0))
            if strength == 0:
                continue
            model, kept, removed = _apply_filtered_lora(model, name, strength)
            reports.append(f"{name}: kept {kept}, removed {removed}")
        report = "\n".join(reports) if reports else "No enabled LoRAs applied."
        logging.info("H3 Image LoRA stack: %s", report)
        return io.NodeOutput(model, report)


class H3ImageLoraFilterExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [H3VideoLoraForImage, H3VideoLoraStackForImage]


async def comfy_entrypoint() -> H3ImageLoraFilterExtension:
    return H3ImageLoraFilterExtension()
