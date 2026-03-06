# AGENTS.md

## Repo Purpose

TheMatrix is a small browser-first procedural FPS prototype with a Matrix glyph renderer. The world logic is conventional 3D; the shipped visual output is the glyph pass.

## Working Rules

- Fix the root cause, not just the visible artifact.
- Preserve the split between `runtime`, `world`, and `render`.
- Prefer small targeted changes over broad rewrites.
- Keep the visible output glyph-first. Do not regress back toward showing the raw Three.js scene directly.
- When adjusting visuals, preserve terrain readability and prop/world coupling at the same time.

## Key Commands

```bash
npm run dev
npm test
npm run build
```

Run `npm test` and `npm run build` after meaningful changes.

## Architecture Notes

### Runtime

- `src/runtime/Game.ts` owns shell setup, main loop, camera wiring, resize handling, and pointer-lock flow.
- `src/runtime/InputController.ts` owns keyboard/mouse input and pointer lock state.
- `src/runtime/FirstPersonController.ts` owns grounded FPS movement.

### World

- `src/world/WorldManager.ts` owns chunk streaming, chunk lifecycle, terrain mesh creation, and tree instancing.
- `src/world/terrain.ts` and `src/world/noise.ts` define deterministic terrain sampling.
- `src/world/trees.ts` must remain deterministic for the same seed/chunk.

### Rendering

- `src/render/GlyphRenderer.ts` is the critical file for the Matrix look.
- The renderer consumes a hidden offscreen 3D render and converts it into glyphs using scene-derived signal such as brightness, depth, and edges.
- Animation should stay scene-attached. Avoid screen-wide wallpaper effects that ignore terrain/prop masks.

## Guardrails

- If you change movement, keep it aligned with the camera look direction like a standard FPS.
- If you change glyph animation, bias toward irregular scene-local behavior rather than uniform column patterns.
- If you change terrain visuals, keep hills readable at short view distance.
- If you add new gameplay systems later, do not couple them directly into the renderer.

## Tests

- `src/world/chunks.test.ts`
- `src/world/terrain.test.ts`
- `src/world/trees.test.ts`

These cover deterministic chunking, terrain continuity, and deterministic tree placement. Keep them passing when touching world generation.
