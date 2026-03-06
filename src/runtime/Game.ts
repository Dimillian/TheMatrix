import * as THREE from 'three';
import {
  GLYPH_RENDER_MODE_LABELS,
  GLYPH_RENDER_MODES,
  type GameConfig,
  type GlyphRenderMode,
  WORLD_MODE_LABELS,
  WORLD_MODES,
  type WorldMode,
} from '../types.ts';
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
  private readonly renderModeToggle: HTMLButtonElement;
  private readonly worldModeToggle: HTMLButtonElement;
  private readonly settingsPanel: HTMLDivElement;
  private readonly settingsToggle: HTMLButtonElement;
  private readonly glyphDensityInput: HTMLInputElement;
  private readonly glyphDensityValue: HTMLSpanElement;
  private readonly animationSpeedInput: HTMLInputElement;
  private readonly animationSpeedValue: HTMLSpanElement;
  private readonly mouseSensitivityInput: HTMLInputElement;
  private readonly mouseSensitivityValue: HTMLSpanElement;
  private readonly viewDistanceInput: HTMLInputElement;
  private readonly viewDistanceValue: HTMLSpanElement;
  private readonly terrainContrastInput: HTMLInputElement;
  private readonly terrainContrastValue: HTMLSpanElement;
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
  private settingsVisible = false;

  constructor(root: HTMLDivElement) {
    this.config = createGameConfig();
    this.controller = new FirstPersonController(this.config);

    root.innerHTML = `
      <div class="game-shell">
        <canvas class="game-canvas"></canvas>
        <div class="game-hud">
          <div class="hud-header">
            <span class="hud-title">Matrix HUD</span>
            <div class="hud-actions">
              <button class="hud-toggle" type="button" aria-pressed="false">P Debug: Off</button>
              <button class="render-mode-toggle" type="button">R Render: Classic</button>
              <button class="world-mode-toggle" type="button">T World: Terrain</button>
              <button class="settings-toggle" type="button" aria-pressed="false">O Settings: Off</button>
            </div>
          </div>
          <pre class="hud-summary"></pre>
          <pre class="hud-debug is-hidden"></pre>
        </div>
        <div class="game-settings is-hidden">
          <div class="settings-header">
            <span class="settings-title">Runtime Settings</span>
            <span class="settings-shortcut">O</span>
          </div>
          <label class="settings-row">
            <span class="settings-label">Glyph Density</span>
            <input class="settings-input" data-setting="glyphDensity" type="range" min="0.7" max="1.6" step="0.05" />
            <span class="settings-value" data-value="glyphDensity"></span>
          </label>
          <label class="settings-row">
            <span class="settings-label">Animation Speed</span>
            <input class="settings-input" data-setting="animationSpeed" type="range" min="0.35" max="2.8" step="0.05" />
            <span class="settings-value" data-value="animationSpeed"></span>
          </label>
          <label class="settings-row">
            <span class="settings-label">Mouse Sensitivity</span>
            <input class="settings-input" data-setting="mouseSensitivity" type="range" min="0.0008" max="0.006" step="0.0001" />
            <span class="settings-value" data-value="mouseSensitivity"></span>
          </label>
          <label class="settings-row">
            <span class="settings-label">View Distance</span>
            <input class="settings-input" data-setting="viewDistance" type="range" min="1" max="4" step="1" />
            <span class="settings-value" data-value="viewDistance"></span>
          </label>
          <label class="settings-row">
            <span class="settings-label">Terrain Contrast</span>
            <input class="settings-input" data-setting="terrainContrast" type="range" min="0.6" max="2" step="0.05" />
            <span class="settings-value" data-value="terrainContrast"></span>
          </label>
        </div>
        <div class="game-overlay">
          <div class="overlay-card">
            <h1>The Matrix</h1>
            <p>Click to enter the stream. Use WASD to move and the mouse to look around. Press Esc to release the pointer.</p>
            <p>Press P for debug info, R to switch render mode, T to switch world, and O for runtime settings.</p>
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
    const renderModeToggle = root.querySelector<HTMLButtonElement>('.render-mode-toggle');
    const worldModeToggle = root.querySelector<HTMLButtonElement>('.world-mode-toggle');
    const settingsPanel = root.querySelector<HTMLDivElement>('.game-settings');
    const settingsToggle = root.querySelector<HTMLButtonElement>('.settings-toggle');
    const glyphDensityInput = root.querySelector<HTMLInputElement>('[data-setting="glyphDensity"]');
    const glyphDensityValue = root.querySelector<HTMLSpanElement>('[data-value="glyphDensity"]');
    const animationSpeedInput = root.querySelector<HTMLInputElement>('[data-setting="animationSpeed"]');
    const animationSpeedValue = root.querySelector<HTMLSpanElement>('[data-value="animationSpeed"]');
    const mouseSensitivityInput = root.querySelector<HTMLInputElement>('[data-setting="mouseSensitivity"]');
    const mouseSensitivityValue = root.querySelector<HTMLSpanElement>('[data-value="mouseSensitivity"]');
    const viewDistanceInput = root.querySelector<HTMLInputElement>('[data-setting="viewDistance"]');
    const viewDistanceValue = root.querySelector<HTMLSpanElement>('[data-value="viewDistance"]');
    const terrainContrastInput = root.querySelector<HTMLInputElement>('[data-setting="terrainContrast"]');
    const terrainContrastValue = root.querySelector<HTMLSpanElement>('[data-value="terrainContrast"]');
    const overlay = root.querySelector<HTMLDivElement>('.game-overlay');
    const overlayStatus = root.querySelector<HTMLParagraphElement>('.overlay-status');

    if (
      !canvas ||
      !shell ||
      !hud ||
      !hudSummary ||
      !hudDebug ||
      !hudToggle ||
      !renderModeToggle ||
      !worldModeToggle ||
      !settingsPanel ||
      !settingsToggle ||
      !glyphDensityInput ||
      !glyphDensityValue ||
      !animationSpeedInput ||
      !animationSpeedValue ||
      !mouseSensitivityInput ||
      !mouseSensitivityValue ||
      !viewDistanceInput ||
      !viewDistanceValue ||
      !terrainContrastInput ||
      !terrainContrastValue ||
      !overlay ||
      !overlayStatus
    ) {
      throw new Error('Game shell failed to initialize.');
    }

    this.shell = shell;
    this.hudSummary = hudSummary;
    this.hudDebug = hudDebug;
    this.hudToggle = hudToggle;
    this.renderModeToggle = renderModeToggle;
    this.worldModeToggle = worldModeToggle;
    this.settingsPanel = settingsPanel;
    this.settingsToggle = settingsToggle;
    this.glyphDensityInput = glyphDensityInput;
    this.glyphDensityValue = glyphDensityValue;
    this.animationSpeedInput = animationSpeedInput;
    this.animationSpeedValue = animationSpeedValue;
    this.mouseSensitivityInput = mouseSensitivityInput;
    this.mouseSensitivityValue = mouseSensitivityValue;
    this.viewDistanceInput = viewDistanceInput;
    this.viewDistanceValue = viewDistanceValue;
    this.terrainContrastInput = terrainContrastInput;
    this.terrainContrastValue = terrainContrastValue;
    this.overlay = overlay;
    this.overlayStatus = overlayStatus;
    this.glyphRenderer = new GlyphRenderer(canvas, this.config);
    this.input = new InputController(shell);
    this.world = new WorldManager(this.scene, this.config);
    this.overlay.addEventListener('click', this.handleStartClick);
    this.shell.addEventListener('click', this.handleStartClick);
    this.hudToggle.addEventListener('click', this.handleHudToggle);
    this.renderModeToggle.addEventListener('click', this.handleRenderModeToggle);
    this.worldModeToggle.addEventListener('click', this.handleWorldModeToggle);
    this.settingsToggle.addEventListener('click', this.handleSettingsToggle);
    hud.addEventListener('click', this.stopShellClickPropagation);
    hud.addEventListener('pointerdown', this.stopShellClickPropagation);
    settingsPanel.addEventListener('click', this.stopShellClickPropagation);
    settingsPanel.addEventListener('pointerdown', this.stopShellClickPropagation);
    glyphDensityInput.addEventListener('input', this.handleGlyphDensityInput);
    animationSpeedInput.addEventListener('input', this.handleAnimationSpeedInput);
    mouseSensitivityInput.addEventListener('input', this.handleMouseSensitivityInput);
    viewDistanceInput.addEventListener('input', this.handleViewDistanceInput);
    terrainContrastInput.addEventListener('input', this.handleTerrainContrastInput);
    this.input.onPointerLockChange = this.handlePointerLockChange;
    this.input.onPointerLockError = this.handlePointerLockError;

    this.camera.rotation.order = 'YXZ';
    this.scene.background = new THREE.Color(0x010302);

    const hemi = new THREE.HemisphereLight(0xa8ffc3, 0x06210d, 0.7);
    const ambient = new THREE.AmbientLight(0xb3ffd0, 0.25);
    const directional = new THREE.DirectionalLight(0xc8ffd5, 1.85);
    directional.position.set(-18, 30, 10);
    this.scene.add(hemi, ambient, directional);

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.initializeSettingsPanel();
    this.applyWorldEnvironment();
    this.resetSpawnToCurrentWorld();
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
    this.renderModeToggle.removeEventListener('click', this.handleRenderModeToggle);
    this.worldModeToggle.removeEventListener('click', this.handleWorldModeToggle);
    this.settingsToggle.removeEventListener('click', this.handleSettingsToggle);
    this.glyphDensityInput.removeEventListener('input', this.handleGlyphDensityInput);
    this.animationSpeedInput.removeEventListener('input', this.handleAnimationSpeedInput);
    this.mouseSensitivityInput.removeEventListener('input', this.handleMouseSensitivityInput);
    this.viewDistanceInput.removeEventListener('input', this.handleViewDistanceInput);
    this.terrainContrastInput.removeEventListener('input', this.handleTerrainContrastInput);
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

  private readonly handleSettingsToggle = (): void => {
    this.settingsVisible = !this.settingsVisible;
    this.syncSettingsVisibility();
  };

  private readonly handleRenderModeToggle = (): void => {
    this.applyRenderMode(this.getNextRenderMode());
  };

  private readonly handleWorldModeToggle = (): void => {
    this.applyWorldMode(this.getNextWorldMode());
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyP') {
      event.preventDefault();
      this.debugHudVisible = !this.debugHudVisible;
      this.syncHudVisibility();
      this.updateHud(0);
      return;
    }

    if (event.code === 'KeyO') {
      event.preventDefault();
      this.settingsVisible = !this.settingsVisible;
      this.syncSettingsVisibility();
      return;
    }

    if (event.code === 'KeyR') {
      event.preventDefault();
      this.applyRenderMode(this.getNextRenderMode());
      return;
    }

    if (event.code === 'KeyT') {
      event.preventDefault();
      this.applyWorldMode(this.getNextWorldMode());
    }
  };

  private readonly stopShellClickPropagation = (event: Event): void => {
    event.stopPropagation();
  };

  private readonly handleGlyphDensityInput = (): void => {
    this.config.glyphDensity = Number(this.glyphDensityInput.value);
    this.applyGlyphDensity();
    this.updateSettingsPanelValues();
    this.updateHud(0);
  };

  private readonly handleAnimationSpeedInput = (): void => {
    this.config.animationSpeed = Number(this.animationSpeedInput.value);
    this.updateSettingsPanelValues();
  };

  private readonly handleMouseSensitivityInput = (): void => {
    this.config.mouseSensitivity = Number(this.mouseSensitivityInput.value);
    this.updateSettingsPanelValues();
  };

  private readonly handleViewDistanceInput = (): void => {
    this.config.activeRadius = Number(this.viewDistanceInput.value);
    this.config.unloadRadius = this.config.activeRadius + 1;
    this.applyWorldEnvironment();
    this.updateSettingsPanelValues();
    this.updateHud(0);
  };

  private readonly handleTerrainContrastInput = (): void => {
    this.config.terrainContrast = Number(this.terrainContrastInput.value);
    this.updateSettingsPanelValues();
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
    const renderModeLabel = this.glyphRenderer.getRenderModeLabel();
    const worldModeLabel = WORLD_MODE_LABELS[this.config.worldMode];
    const spawn = this.world.getSpawnPoint();

    this.hudSummary.textContent = [
      `XYZ   ${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`,
      `FPS   ${this.fps.toFixed(0)}`,
      `Seed  ${this.config.seed}`,
      `World ${worldModeLabel}`,
      `Mode  ${renderModeLabel}`,
      `P     ${this.debugHudVisible ? 'hide debug' : 'show debug'}`,
      `R     next render mode`,
      `T     next world`,
      `O     ${this.settingsVisible ? 'hide settings' : 'show settings'}`,
    ].join('\n');

    this.hudDebug.textContent = [
      `Chunk        ${chunk.x}, ${chunk.z}`,
      `Spawn        ${spawn.x.toFixed(0)}, ${spawn.z.toFixed(0)}`,
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

  private syncRenderModeControls(): void {
    const renderModeLabel = GLYPH_RENDER_MODE_LABELS[this.config.renderMode];
    this.renderModeToggle.textContent = `R Render: ${renderModeLabel}`;
  }

  private syncWorldModeControls(): void {
    const worldModeLabel = WORLD_MODE_LABELS[this.config.worldMode];
    this.worldModeToggle.textContent = `T World: ${worldModeLabel}`;
  }

  private syncSettingsVisibility(): void {
    this.settingsToggle.textContent = this.settingsVisible ? 'O Settings: On' : 'O Settings: Off';
    this.settingsToggle.setAttribute('aria-pressed', String(this.settingsVisible));
    this.settingsPanel.classList.toggle('is-hidden', !this.settingsVisible);
  }

  private initializeSettingsPanel(): void {
    this.glyphDensityInput.value = this.config.glyphDensity.toFixed(2);
    this.animationSpeedInput.value = this.config.animationSpeed.toFixed(2);
    this.mouseSensitivityInput.value = this.config.mouseSensitivity.toFixed(4);
    this.viewDistanceInput.value = String(this.config.activeRadius);
    this.terrainContrastInput.value = this.config.terrainContrast.toFixed(2);
    this.updateSettingsPanelValues();
    this.syncSettingsVisibility();
    this.syncRenderModeControls();
    this.syncWorldModeControls();
  }

  private updateSettingsPanelValues(): void {
    this.glyphDensityValue.textContent = `${this.config.glyphDensity.toFixed(2)}x`;
    this.animationSpeedValue.textContent = `${this.config.animationSpeed.toFixed(2)}x`;
    this.mouseSensitivityValue.textContent = this.config.mouseSensitivity.toFixed(4);
    this.viewDistanceValue.textContent = `${this.config.activeRadius} chunks`;
    this.terrainContrastValue.textContent = `${this.config.terrainContrast.toFixed(2)}x`;
  }

  private applyGlyphDensity(): void {
    const density = this.config.glyphDensity;
    this.config.glyphCellWidth = THREE.MathUtils.clamp(Math.round(10 - density * 3), 4, 12);
    this.config.glyphCellHeight = THREE.MathUtils.clamp(Math.round(15 - density * 4), 7, 18);
    this.config.renderScale = THREE.MathUtils.clamp(0.18 + density * 0.24, 0.22, 0.62);
    this.glyphRenderer.resize(window.innerWidth, window.innerHeight);
  }

  private applyWorldEnvironment(): void {
    if (this.config.worldMode === 'interior') {
      const fogFar = this.config.chunkSize * (this.config.activeRadius + 0.75);
      const fogNear = Math.max(10, fogFar * 0.18);
      this.scene.fog = new THREE.Fog(0x010804, fogNear, fogFar);
      this.scene.background = new THREE.Color(0x010403);
      return;
    }

    const fogFar = this.config.chunkSize * (this.config.activeRadius + 1.1);
    const fogNear = Math.max(16, fogFar * 0.22);
    this.scene.fog = new THREE.Fog(0x020805, fogNear, fogFar);
    this.scene.background = new THREE.Color(0x010302);
  }

  private applyRenderMode(mode: GlyphRenderMode): void {
    this.glyphRenderer.setRenderMode(mode);
    this.syncRenderModeControls();
    this.updateHud(0);
  }

  private getNextRenderMode(): GlyphRenderMode {
    const currentIndex = GLYPH_RENDER_MODES.indexOf(this.config.renderMode);
    const nextIndex = (currentIndex + 1) % GLYPH_RENDER_MODES.length;
    return GLYPH_RENDER_MODES[nextIndex] ?? GLYPH_RENDER_MODES[0];
  }

  private applyWorldMode(mode: WorldMode): void {
    this.world.setWorldMode(mode);
    this.applyWorldEnvironment();
    this.resetSpawnToCurrentWorld();
    this.world.update(this.controller.position, this.frame);
    this.syncWorldModeControls();
    this.updateHud(0);
  }

  private getNextWorldMode(): WorldMode {
    const currentIndex = WORLD_MODES.indexOf(this.config.worldMode);
    const nextIndex = (currentIndex + 1) % WORLD_MODES.length;
    return WORLD_MODES[nextIndex] ?? WORLD_MODES[0];
  }

  private resetSpawnToCurrentWorld(): void {
    const spawn = this.world.getSpawnPoint();
    this.controller.setSpawn(spawn.x, spawn.z, this.world.getHeightAt(spawn.x, spawn.z));
  }
}
