# TheMatrix

![TheMatrix demo](./assets/thematrix-demo.gif)

Small browser FPS prototype where an infinite procedural landscape is rendered as animated Matrix-style glyphs instead of normal pixels.

Live demo: [dimillian.github.io/TheMatrix](https://dimillian.github.io/TheMatrix/)

## What It Is

- Desktop-first first-person exploration prototype
- Infinite chunk-streamed terrain with rolling hills and procedural trees
- Hidden Three.js 3D scene converted into animated green glyphs on a visible 2D canvas
- Matrix-style motion is masked by actual terrain/prop signal so the world feels like it is being redrawn in symbols

## Stack

- Vite
- TypeScript
- Three.js
- Vitest

## Run Locally

```bash
npm install
npm run dev
```

Then open the local Vite URL, usually `http://localhost:5173`.

## Other Commands

```bash
npm test
npm run build
npm run preview
```

## Controls

- Click the game view to lock the pointer
- `WASD` to move
- Mouse to look around
- `Esc` to release the pointer

## How Rendering Works

The world is not generated as glyphs directly.

1. Procedural terrain and trees are generated as a simple hidden 3D scene.
2. That scene is rendered offscreen with Three.js.
3. The renderer samples brightness, depth, neighborhood signal, and edges from the offscreen image.
4. Those samples are converted into animated green glyphs on the visible canvas.

That means the gameplay/world model stays simple 3D, while the final image is fully Matrix-styled.

## Project Structure

- `src/runtime/`
  - game loop, pointer lock, input, FPS controller
- `src/world/`
  - chunk math, noise, terrain sampling, tree generation, world streaming
- `src/render/`
  - glyph compositor and scene-to-symbol conversion
- `src/config.ts`
  - central gameplay/render tuning values
- `src/types.ts`
  - shared runtime/world interfaces

## Current Scope

- Explore-only prototype
- No collisions against trees
- No enemies, inventory, saving, or sound
- Short view distance by design

## Deploying

This project can be deployed as a static site, including GitHub Pages, because everything runs client-side.
