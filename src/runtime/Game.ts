import * as THREE from 'three';
import { GAME_CONFIG } from '../config.ts';
import { GlyphRenderer } from '../render/GlyphRenderer.ts';
import { WorldManager } from '../world/WorldManager.ts';
import { FirstPersonController } from './FirstPersonController.ts';
import { InputController } from './InputController.ts';

export class Game {
  private readonly shell: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly overlayStatus: HTMLParagraphElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(68, 1, 0.1, 250);
  private readonly glyphRenderer: GlyphRenderer;
  private readonly input: InputController;
  private readonly controller = new FirstPersonController(GAME_CONFIG);
  private readonly world: WorldManager;

  private animationFrame = 0;
  private lastTimestamp = 0;
  private accumulator = 0;
  private frame = 0;

  constructor(root: HTMLDivElement) {
    root.innerHTML = `
      <div class="game-shell">
        <canvas class="game-canvas"></canvas>
        <div class="game-overlay">
          <div class="overlay-card">
            <h1>The Matrix</h1>
            <p>Click to enter the stream. Use WASD to move and the mouse to look around. Press Esc to release the pointer.</p>
            <p class="overlay-status">Click anywhere on this panel to start.</p>
          </div>
        </div>
      </div>
    `;

    const canvas = root.querySelector<HTMLCanvasElement>('.game-canvas');
    const shell = root.querySelector<HTMLDivElement>('.game-shell');
    const overlay = root.querySelector<HTMLDivElement>('.game-overlay');
    const overlayStatus = root.querySelector<HTMLParagraphElement>('.overlay-status');

    if (!canvas || !shell || !overlay || !overlayStatus) {
      throw new Error('Game shell failed to initialize.');
    }

    this.shell = shell;
    this.overlay = overlay;
    this.overlayStatus = overlayStatus;
    this.glyphRenderer = new GlyphRenderer(canvas, GAME_CONFIG);
    this.input = new InputController(shell);
    this.world = new WorldManager(this.scene, GAME_CONFIG);
    this.overlay.addEventListener('click', this.handleStartClick);
    this.shell.addEventListener('click', this.handleStartClick);
    this.input.onPointerLockChange = this.handlePointerLockChange;
    this.input.onPointerLockError = this.handlePointerLockError;

    this.camera.rotation.order = 'YXZ';
    this.scene.fog = new THREE.Fog(0x020805, 28, GAME_CONFIG.chunkSize * (GAME_CONFIG.activeRadius + 1.1));
    this.scene.background = new THREE.Color(0x010302);

    const hemi = new THREE.HemisphereLight(0xa8ffc3, 0x06210d, 0.7);
    const ambient = new THREE.AmbientLight(0xb3ffd0, 0.25);
    const directional = new THREE.DirectionalLight(0xc8ffd5, 1.85);
    directional.position.set(-18, 30, 10);
    this.scene.add(hemi, ambient, directional);

    this.controller.setSpawn(
      GAME_CONFIG.spawnX,
      GAME_CONFIG.spawnZ,
      this.world.getHeightAt(GAME_CONFIG.spawnX, GAME_CONFIG.spawnZ),
    );

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.handleResize();
  }

  start(): void {
    this.lastTimestamp = performance.now();
    this.animationFrame = window.requestAnimationFrame(this.loop);
  }

  dispose(): void {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.overlay.removeEventListener('click', this.handleStartClick);
    this.shell.removeEventListener('click', this.handleStartClick);
    this.input.dispose();
    this.glyphRenderer.dispose();
    this.world.dispose();
  }

  private readonly handleStartClick = (): void => {
    this.overlayStatus.textContent = 'Requesting pointer lock...';
    this.input.requestPointerLock();
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

    while (this.accumulator >= GAME_CONFIG.fixedTimeStep) {
      this.update(GAME_CONFIG.fixedTimeStep);
      this.accumulator -= GAME_CONFIG.fixedTimeStep;
    }

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
}
