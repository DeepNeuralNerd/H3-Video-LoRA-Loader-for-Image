# H3 Video LoRA for H3 Image

A ComfyUI loader for trying MiniMax H3 video LoRAs with **MiniMax H3-Image**. It removes LoRA entries for the absent audio branch and the differently sized final image output layer before ComfyUI applies the remaining entries. The original LoRA file and base model are not edited.

This is a compatibility filter, not a conversion or retraining tool. A video LoRA can load cleanly and still have an undesirable effect on still images.

The package includes **H3 Image LoRA Stack**, a compact row-based loader inspired by the workflow of Ausboss's LoRA Loader. Its frontend and loading code are original. Each row has an enable switch, searchable LoRA name field, model strength, and remove button; the header has an add button and an all-rows switch. The original single-LoRA node remains available for existing workflows.

## Install

Clone this repository into `ComfyUI/custom_nodes/` and restart ComfyUI:

```powershell
cd path\to\ComfyUI\custom_nodes
git clone https://github.com/DeepNeuralNerd/ComfyUI-H3-Video-LoRA-for-Image.git
```

No additional Python packages are required beyond ComfyUI. The package uses ComfyUI's V3 node API, so use a current ComfyUI build that supports MiniMax H3-Image and V3 custom nodes.

## Use

1. Load a **MiniMax H3-Image** diffusion checkpoint in your image workflow.
2. Add **H3 Image LoRA Stack** from `model/loaders/minimax`. For a single LoRA, you can also use **H3 Video LoRA for H3 Image**.
3. Connect the checkpoint's `MODEL` output to the node's `model` input.
4. Press **+ LoRA** for each video LoRA. Search for its filename, set strength, and use its checkbox to enable or disable it. Rows apply from top to bottom.
5. Connect the node's `MODEL` output wherever the checkpoint model was previously connected.
6. The optional `STRING` output reports how many entries each enabled LoRA kept and removed. You can connect it to a text display node, or read the same summary in the ComfyUI log.

Place LoRA files in any folder ComfyUI recognizes as `loras`. The stack's searchable list comes from ComfyUI's own LoRA registry; you can also type a filename. The node checks that its input is a MiniMax H3-Image model; it does not load the image checkpoint or VAE for you.

## What gets filtered

The two checked local H3 video checkpoints (`ref2va` and `fl2va`, pruned INT8 ConvRot) have 932 identically named and shaped tensors. The checked H3-Image checkpoint shares names and shapes with 926 of those 932 tensors. The six differences are:

| Target | H3-Image relationship | Action |
| --- | --- | --- |
| `audio_patch_proj.weight` and `.bias` | Absent | Remove corresponding LoRA entries |
| `final_layer.audio_out.weight` and `.bias` | Absent | Remove corresponding LoRA entries |
| `final_layer.video_out.weight` and `.bias` | Image output shape differs | Remove corresponding LoRA entries |

For the checked files, `final_layer.video_out.weight` is `[96, 5376]` in the video models and `[576, 5376]` in H3-Image. The filter recognizes dot and underscore naming, including ComfyUI and common `lora_unet_` keys. It removes every entry for these targets, including LoRA up/down tensors, alpha values, and full weight differences. It retains the shared transformer blocks, `video_patch_proj`, and other matching targets. ComfyUI performs its usual key mapping and patching after filtering.

The filter runs when the node executes, before denoising. It does not change the LoRA file on disk. It does not inspect or rewrite any other potentially incompatible LoRA targets; ComfyUI's normal loader may warn about additional unmatched keys.

## Limits

- Matching tensor names and shapes establish *structural* compatibility only. They do not prove that a LoRA's learned visual effect transfers to H3-Image.
- Motion and video acceleration LoRAs may be ineffective or degrade still images even when their shared-layer entries load.
- This node applies diffusion-model LoRA weights only. It does not patch the text encoder.
- The filter is specific to the checked MiniMax H3 video-to-H3-Image relationship. Other model families need their own compatibility analysis.

## Development and verification

Both nodes are registered through ComfyUI's `comfy_entrypoint()`. The Python loader is in [`__init__.py`](./__init__.py); the stack interface is in [`web/stack.js`](./web/stack.js). The frontend queries only the local ComfyUI server for available LoRA filenames. The package has no external Python dependencies.

Verification on the author's local setup used these checkpoints:

- `minimax_h3_ref2va_pruned_int8_convrot.safetensors`
- `minimax_h3_fl2va_pruned_int8_convrot.safetensors`
- `minimax_h3_image_pruned_int8_convrot.safetensors`

The node imported and registered with the installed ComfyUI environment. A sampled visual style LoRA had zero entries filtered; a sampled FastH3 LoRA had six filtered entries, exactly the audio and output targets above. This does not constitute an image quality or generation test.

## License

MIT. See [LICENSE](./LICENSE).
