import * as THREE from 'three';
import type { GameConfig } from '../types.ts';
import { createGameConfig } from '../config.ts';
import { GlyphRenderer } from '../render/GlyphRenderer.ts';
import { worldToChunkCoord } from '../world/chunks.ts';
import { WorldManager } from '../world/WorldManager.ts';
import { FirstPersonController } from './FirstPersonController.ts';
import { InputController } from './InputController.ts';

export class Game {
  private readonly shell: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly overlayStatus: HTMLParagraphElement;
  private readonly hudSummary: HTMLPreElement;
  private readonly hudDebug: HTMLPreElement;
  private readonly hudToggle: HTMLButtonElement;
  private readonly config: GameConfig;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(68, 1, 0.1, 250);
  private readonly glyphRenderer: GlyphRenderer;
  private readonly input: InputController;
  private readonly controller: FirstPersonController;
  private readonly world: WorldManager;

  private animationFrame = 0;
  private lastTimestamp = 0;
  private accumulator = 0;
  private frame = 0;
  private fps = 0;
  private debugHudVisible = false;

  constructor(root: HTMLDivElement) {
    this.config = createGameConfig();
    this.controller = new FirstPersonController(this.config);

    root.innerHTML = `
      <div class="game-shell">
        <canvas class="game-canvas"></canvas>
        <div class="game-hud">
          <div class="hud-header">
            <span class="hud-title">Matrix HUD</span>
            <button class="hud-toggle" type="button" aria-pressed="false">P Debug: Off</button>
          </div>
          <pre class="hud-summary"></pre>
          <pre class="hud-debug is-hidden"></pre>
        </div>
        <div class="game-overlay">
          <div class="overlay-card">
            <h1>The Matrix</h1>
            <p>Click to enter the stream. Use WASD to move and the mouse to look around. Press Esc to release the pointer.</p>
            <p>Press P or use the HUD toggle for chunk/debug info.</p>
            <p class="overlay-status">Click anywhere on this panel to start.</p>
          </div>
        </div>
      </div>
    `;

    const canvas = root.querySelector<HTMLCanvasElement>('.game-canvas');
    const shell = root.querySelector<HTMLDivElement>('.game-shell');
    const hud = root.querySelector<HTMLDivElement>('.game-hud');
    const hudSummary = root.querySelector<HTMLPreElement>('.hud-summary');
    const hudDebug = root.querySelector<HTMLPreElement>('.hud-debug');
    const hudToggle = root.querySelector<HTMLButtonElement>('.hud-toggle');
    const overlay = root.querySelector<HTMLDivElement>('.game-overlay');
    const overlayStatus = root.querySelector<HTMLParagraphElement>('.overlay-status');

    if (!canvas || !shell || !hud || !hudSummary || !hudDebug || !hudToggle || !overlay || !overlayStatus) {
      throw new Error('Game shell failed to initialize.');
    }

    this.shell = shell;
    this.hudSummary = hudSummary;
    this.hudDebug = hudDebug;
    this.hudToggle = hudToggle;
    this.overlay = overlay;
    this.overlayStatus = overlayStatus;
    this.glyphRenderer = new GlyphRenderer(canvas, this.config);
    this.input = new InputController(shell);
    this.world = new WorldManager(this.scene, this.config);
    this.overlay.addEventListener('click', this.handleStartClick);
    this.shell.addEventListener('click', this.handleStartClick);
    this.hudToggle.addEventListener('click', this.handleHudToggle);
    this.input.onPointerLockChange = this.handlePointerLockChange;
    this.input.onPointerLockError = this.handlePointerLockError;

    this.camera.rotation.order = 'YXZ';
    this.scene.fog = new THREE.Fog(0x020805, 28, this.config.chunkSize * (this.config.activeRadius + 1.1));
    this.scene.background = new THREE.Color(0x010302);

    const hemi = new THREE.HemisphereLight(0xa8ffc3, 0x06210d, 0.7);
    const ambient = new THREE.AmbientLight(0xb3ffd0, 0.25);
    const directional = new THREE.DirectionalLight(0xc8ffd5, 1.85);
    directional.position.set(-18, 30, 10);
    this.scene.add(hemi, ambient, directional);

    this.controller.setSpawn(
      this.config.spawnX,
      this.config.spawnZ,
      this.world.getHeightAt(this.config.spawnX, this.config.spawnZ),
    );

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.updateHud(0);
    this.handleResize();
  }

  start(): void {
    this.lastTimestamp = performance.now();
    this.animationFrame = window.requestAnimationFrame(this.loop);
  }

  dispose(): void {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.overlay.removeEventListener('click', this.handleStartClick);
    this.shell.removeEventListener('click', this.handleStartClick);
    this.hudToggle.removeEventListener('click', this.handleHudToggle);
    this.input.dispose();
    this.glyphRenderer.dispose();
    this.world.dispose();
  }

  private readonly handleStartClick = (): void => {
    this.overlayStatus.textContent = 'Requesting pointer lock...';
    this.input.requestPointerLock();
  };

  private readonly handleHudToggle = (): void => {
    this.debugHudVisible = !this.debugHudVisible;
    this.syncHudVisibility();
    this.updateHud(0);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyP') {
      return;
    }

    event.preventDefault();
    this.debugHudVisible = !this.debugHudVisible;
    this.syncHudVisibility();
    this.updateHud(0);
  };

  private readonly handlePointerLockChange = (locked: boolean): void => {
    if (locked) {
      this.overlayStatus.textContent = 'Pointer locked.';
      return;
    }

    this.overlayStatus.textContent = 'Click anywhere on this panel to start.';
  };

  private readonly handlePointerLockError = (message: string): void => {
    this.overlayStatus.textContent = message;
  };

  private readonly handleResize = (): void => {
    this.glyphRenderer.resize(window.innerWidth, window.innerHeight);
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.accumulator = 0;
      this.lastTimestamp = performance.now();
    }
  };

  private readonly loop = (timestamp: number): void => {
    const frameTime = Math.min(0.1, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    this.accumulator += frameTime;
    const instantFps = frameTime > 0 ? 1 / frameTime : 0;
    this.fps = this.fps === 0 ? instantFps : THREE.MathUtils.lerp(this.fps, instantFps, 0.15);

    while (this.accumulator >= this.config.fixedTimeStep) {
      this.update(this.config.fixedTimeStep);
      this.accumulator -= this.config.fixedTimeStep;
    }

    this.updateHud(frameTime);
    this.render(frameTime);
    this.animationFrame = window.requestAnimationFrame(this.loop);
  };

  private update(deltaTime: number): void {
    this.controller.update(deltaTime, this.input, (x, z) => this.world.getHeightAt(x, z));
    this.world.update(this.controller.position, this.frame);
    this.frame += 1;
    this.overlay.classList.toggle('is-hidden', this.input.locked);
  }

  private render(deltaTime: number): void {
    this.camera.position.copy(this.controller.position);
    this.camera.position.y += this.controller.getCameraBobOffset();
    this.camera.rotation.y = this.controller.yaw;
    this.camera.rotation.x = this.controller.pitch;
    this.glyphRenderer.render(this.scene, this.camera, deltaTime);
  }

  private updateHud(_deltaTime: number): void {
    const position = this.controller.position;
    const chunk = worldToChunkCoord(position.x, position.z, this.config.chunkSize);
    const worldStats = this.world.getDebugStats();
    const renderStats = this.glyphRenderer.getDebugStats();

    this.hudSummary.textContent = [
      `XYZ   ${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`,
      `FPS   ${this.fps.toFixed(0)}`,
      `Seed  ${this.config.seed}`,
      `P     ${this.debugHudVisible ? 'hide debug' : 'show debug'}`,
    ].join('\n');

    this.hudDebug.textContent = [
      `Chunk        ${chunk.x}, ${chunk.z}`,
      `Spawn        ${this.config.spawnX}, ${this.config.spawnZ}`,
      `Chunks live  ${worldStats.activeChunks}`,
      `Queue        ${worldStats.queuedChunks}`,
      `Glyph grid   ${renderStats.columns} x ${renderStats.rows}`,
      `Render tex   ${renderStats.renderWidth} x ${renderStats.renderHeight}`,
      `View radius  ${this.config.activeRadius}/${this.config.unloadRadius}`,
    ].join('\n');
  }

  private syncHudVisibility(): void {
    this.hudToggle.textContent = this.debugHudVisible ? 'P Debug: On' : 'P Debug: Off';
    this.hudToggle.setAttribute('aria-pressed', String(this.debugHudVisible));
    this.hudDebug.classList.toggle('is-hidden', !this.debugHudVisible);
  }
}
