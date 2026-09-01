SiliconFlow image generation is available in this workspace through the MCP server `siliconflow-images` and the tool `generate_image`.

Use `generate_image` whenever a task needs a real shipped visual asset instead of only written copy, for example hero images, editorial covers, workflow visuals, OG images, thumbnails, banners, or support graphics for landing pages.

Default behavior:
- Use `black-forest-labs/FLUX.2-pro` by default unless the task explicitly requires another image model.
- Use one of these sizes unless the task demands a different supported aspect ratio: `1024x576`, `1024x768`, `768x1024`, `576x1024`, `512x512`.
- Save generated images under the workspace-root `generated-assets/` folder first, then also publish to the final app asset path when the image is adopted.
- Never expose, duplicate, or hardcode the SiliconFlow API key in tracked files, prompts, logs, or responses.

<!-- BEGIN AGENTIC-ENGINEERING-PLATFORM -->
Use repository evidence before assumptions. When `graphify-out/graph.json` exists, query Graphify before broad repository exploration; determine impacted files, callers, dependencies, and data flows, then read only the minimum relevant source. Never ingest graph artifacts wholesale.

For non-trivial work: understand → graph discovery → plan → implement narrowly → test → review → verify. Preserve unrelated behavior and existing instructions. Do not hardcode secrets, providers, credentials, or environment-specific values. Do not invent repository behavior or claim checks passed unless executed. Keep token use lean, but never skip correctness, security, migrations, or critical dependency inspection. For UI changes, verify responsive behavior, accessibility, and all interaction states.
<!-- END AGENTIC-ENGINEERING-PLATFORM -->
