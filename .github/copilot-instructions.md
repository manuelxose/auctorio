SiliconFlow image generation is available in this workspace through the MCP server `siliconflow-images` and the tool `generate_image`.

Use `generate_image` whenever a task needs a real shipped visual asset instead of only written copy, for example hero images, editorial covers, workflow visuals, OG images, thumbnails, banners, or support graphics for landing pages.

Default behavior:
- Use `black-forest-labs/FLUX.2-pro` by default unless the task explicitly requires another image model.
- Use one of these sizes unless the task demands a different supported aspect ratio: `1024x576`, `1024x768`, `768x1024`, `576x1024`, `512x512`.
- Save generated images under the workspace-root `generated-assets/` folder first, then also publish to the final app asset path when the image is adopted.
- Never expose, duplicate, or hardcode the SiliconFlow API key in tracked files, prompts, logs, or responses.
