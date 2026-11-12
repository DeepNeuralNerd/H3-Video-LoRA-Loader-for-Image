# H3 Video LoRA for H3 Image

A ComfyUI loader for trying MiniMax H3 video LoRAs with **MiniMax H3-Image or H3 video**. With H3-Image, it removes LoRA entries for the absent audio branch and the differently sized final image output layer before ComfyUI applies the remaining entries. With an H3 video model, it keeps those entries. The original LoRA file and base model are not edited.

This is a compatibility filter, not a conversion or retraining tool. A video LoRA can load cleanly and still have an undesirable effect on still images.

Some H3 video LoRAs have worked for the author with H3-Image, but results vary by LoRA, checkpoint, and workflow. **Use at your own risk. Your Mileage May Vary.**

The package includes **H3 Image LoRA Stack**, a power loader inspired by the workflow of Ausboss's LoRA Loader and rgthree's Power Lora Loader. Its frontend and loading code are original. Each row has an enable switch, file button, model strength with quick −/+ buttons, an info button, remove button, and drag grip. Right-click a row for move, duplicate, and toggle actions. The toolbar has saved templates, a master switch that restores the prior row selection, a file-list refresh button, and **+ LoRA**. The original single-LoRA node remains available for existing workflows.

## Install

Clone this repository into `ComfyUI/custom_nodes/` and restart ComfyUI:

```powershell
cd path\to\ComfyUI\custom_nodes
git clone https://github.com/DeepNeuralNerd/H3-Video-LoRA-Loader-for-Image.git
```

No additional Python packages are required beyond ComfyUI. The package uses ComfyUI's V3 node API, so use a current ComfyUI build that supports MiniMax H3-Image and V3 custom nodes.

## Use

1. Load a **MiniMax H3-Image or H3 video** diffusion checkpoint in the matching image or video workflow.
2. Add **H3 Image LoRA Stack** from `model/loaders/minimax`. For a single LoRA, you can also use **H3 Video LoRA for H3 Image**.
3. Connect the checkpoint's `MODEL` output to the node's `model` input.
4. Press **+ LoRA**, search and tick one or more files, then press **Add selected**. Click a row's file button to replace it, or drag it horizontally to scrub strength (hold Shift for finer changes). Type an exact strength or use the −/+ buttons in the same row. Enable or disable it with the checkbox, drag the grip to change application order, or right-click for row actions. The **i** button displays metadata embedded in that LoRA file when available. Embedded names may differ from filenames and do not establish compatibility.
5. Connect the node's `MODEL` output wherever the checkpoint model was previously connected.
6. The optional `STRING` output reports how many entries each enabled LoRA kept and removed. You can connect it to a text display node, or read the same summary in the ComfyUI log.

Place LoRA files in any folder ComfyUI recognizes as `loras`. The picker searches ComfyUI's own LoRA registry and supports selecting several files at once. Type multiple words in any order, such as `h3 realism`; every word must appear somewhere in the folder path or filename, ignoring case and punctuation. Selections remain checked while you change the search. The picker shows match and selection counts. **↻** refreshes the file list. **▤** saves or loads stack templates in this browser. The node detects whether its input is MiniMax H3-Image or H3 video; it does not load the checkpoint or VAE for you.

## What gets filtered

Filtering applies only when the input is H3-Image. For an H3 video input, all LoRA entries are passed to ComfyUI's normal loader, including audio and final output entries. The two checked local H3 video checkpoints (`ref2va` and `fl2va`, pruned INT8 ConvRot) have 932 identically named and shaped tensors. The checked H3-Image checkpoint shares names and shapes with 926 of those 932 tensors. The six differences are:

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
- H3 video LoRAs are passed through on H3 video models, but a LoRA can still contain keys or shapes incompatible with a particular checkpoint. ComfyUI's normal loader may warn or fail in that case.
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
