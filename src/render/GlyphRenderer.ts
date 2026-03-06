import * as THREE from 'three';
import { GLYPH_RENDER_MODE_LABELS, type GameConfig, type GlyphRenderMode } from '../types.ts';

const BACKGROUND_COLOR = 'rgba(0, 4, 1, 1)';
const GLYPH_RAMP = [' ', '.', ':', '-', '=', '+', '*', '1', '0'];
const MATRIX_CHARS = ['0', '1', '+', '-', '=', ':', '|', '*'];

interface GlyphSample {
  column: number;
  row: number;
  brightness: number;
  depth: number;
  localAverage: number;
  edge: number;
  inverseDepth: number;
  worldSignal: number;
  sceneFocus: number;
  sceneMask: number;
  turbulence: number;
}

interface GlyphPaint {
  glyph: string;
  green: number;
  alpha: number;
}

export class GlyphRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly config: GameConfig;
  private readonly context: CanvasRenderingContext2D;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly depthMaterial = new THREE.MeshDepthMaterial();
  private colorTarget: THREE.WebGLRenderTarget;
  private depthTarget: THREE.WebGLRenderTarget;
  private colorPixels = new Uint8Array(0);
  private depthPixels = new Uint8Array(0);
  private rainColumnSpeeds = new Float32Array(0);
  private rainColumnLengths = new Float32Array(0);
  private rainColumnOffsets = new Float32Array(0);
  private rainColumnGaps = new Float32Array(0);
  private rainPersistence = new Float32Array(0);
  private columns = 0;
  private rows = 0;
  private width = 0;
  private height = 0;
  private elapsedTime = 0;

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.canvas = canvas;
    this.config = config;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('2D canvas context is required.');
    }

    this.context = context;
    this.context.textBaseline = 'top';
    this.context.textAlign = 'left';

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 1);

    this.colorTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
    });
    this.depthTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
    });

    this.resize(window.innerWidth, window.innerHeight);
    this.resetModeState();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.columns = Math.max(1, Math.floor(this.width / this.config.glyphCellWidth));
    this.rows = Math.max(1, Math.floor(this.height / this.config.glyphCellHeight));

    const targetWidth = Math.max(1, Math.floor(this.columns * this.config.renderScale));
    const targetHeight = Math.max(1, Math.floor(this.rows * this.config.renderScale));
    this.renderer.setSize(targetWidth, targetHeight, false);
    this.colorTarget.setSize(targetWidth, targetHeight);
    this.depthTarget.setSize(targetWidth, targetHeight);
    this.colorPixels = new Uint8Array(targetWidth * targetHeight * 4);
    this.depthPixels = new Uint8Array(targetWidth * targetHeight * 4);

    this.context.font = `${this.config.glyphCellHeight - 2}px "SFMono-Regular", "Cascadia Mono", monospace`;
    this.resetModeState();
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, deltaTime: number): void {
    const targetWidth = this.colorTarget.width;
    const targetHeight = this.colorTarget.height;

    camera.aspect = this.width / this.height;
    camera.updateProjectionMatrix();

    this.renderer.setRenderTarget(this.colorTarget);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.readRenderTargetPixels(this.colorTarget, 0, 0, targetWidth, targetHeight, this.colorPixels);

    const previousOverride = scene.overrideMaterial;
    scene.overrideMaterial = this.depthMaterial;
    this.renderer.setRenderTarget(this.depthTarget);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.readRenderTargetPixels(this.depthTarget, 0, 0, targetWidth, targetHeight, this.depthPixels);
    scene.overrideMaterial = previousOverride;
    this.renderer.setRenderTarget(null);

    this.drawGlyphs(deltaTime);
  }

  dispose(): void {
    this.colorTarget.dispose();
    this.depthTarget.dispose();
    this.depthMaterial.dispose();
    this.renderer.dispose();
  }

  getRenderMode(): GlyphRenderMode {
    return this.config.renderMode;
  }

  getRenderModeLabel(): string {
    return GLYPH_RENDER_MODE_LABELS[this.config.renderMode];
  }

  setRenderMode(mode: GlyphRenderMode): void {
    if (this.config.renderMode === mode) {
      return;
    }

    this.config.renderMode = mode;
    this.resetModeState();
  }

  getDebugStats(): { columns: number; rows: number; renderWidth: number; renderHeight: number } {
    return {
      columns: this.columns,
      rows: this.rows,
      renderWidth: this.colorTarget.width,
      renderHeight: this.colorTarget.height,
    };
  }

  private drawGlyphs(deltaTime: number): void {
    this.elapsedTime += deltaTime * this.config.animationSpeed;
    this.context.fillStyle = BACKGROUND_COLOR;
    this.context.fillRect(0, 0, this.width, this.height);

    const sourceWidth = this.colorTarget.width;
    const sourceHeight = this.colorTarget.height;

    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const sample = this.createGlyphSample(column, row, sourceWidth, sourceHeight);

        if (!sample) {
          continue;
        }

        const paint =
          this.config.renderMode === 'rain'
            ? this.paintRainGlyph(sample, deltaTime)
            : this.paintClassicGlyph(sample);

        if (!paint) {
          continue;
        }

        this.context.fillStyle = `rgba(90, ${paint.green}, 100, ${paint.alpha})`;
        this.context.fillText(
          paint.glyph,
          column * this.config.glyphCellWidth,
          row * this.config.glyphCellHeight,
        );
      }
    }
  }

  private createGlyphSample(
    column: number,
    row: number,
    sourceWidth: number,
    sourceHeight: number,
  ): GlyphSample | null {
    const sampleX = Math.min(sourceWidth - 1, Math.floor((column / this.columns) * sourceWidth));
    const sampleY = Math.min(sourceHeight - 1, Math.floor((row / this.rows) * sourceHeight));
    const pixelIndex = this.getPixelIndex(sampleX, sampleY, sourceWidth, sourceHeight);

    const brightness = this.readBrightness(pixelIndex);
    const depth = this.readDepth(pixelIndex);
    const localAverage = this.computeNeighborhoodBrightness(sampleX, sampleY, sourceWidth, sourceHeight);
    const edge = this.computeEdge(sampleX, sampleY, sourceWidth, sourceHeight);
    const inverseDepth = 1 - depth;
    const rawWorldSignal = Math.max(
      0,
      brightness * 0.55 +
        localAverage * 0.4 +
        inverseDepth * 0.24 +
        edge * 0.8 -
        0.14,
    );

    const worldSignal = THREE.MathUtils.clamp(
      (rawWorldSignal - 0.05) * (0.85 + this.config.terrainContrast * 0.95) + 0.05,
      0,
      1,
    );

    if (worldSignal < 0.055) {
      return null;
    }

    const sceneFocus = THREE.MathUtils.clamp(
      brightness * 0.25 + localAverage * 0.35 + edge * 0.95 + inverseDepth * 0.15,
      0,
      1,
    );
    const sceneMask =
      THREE.MathUtils.smoothstep(worldSignal, 0.08, 0.2) *
      THREE.MathUtils.smoothstep(sceneFocus, 0.12, 0.34);

    return {
      column,
      row,
      brightness,
      depth,
      localAverage,
      edge,
      inverseDepth,
      worldSignal,
      sceneFocus,
      sceneMask,
      turbulence: this.computeTurbulence(column, row, depth),
    };
  }

  private paintClassicGlyph(sample: GlyphSample): GlyphPaint {
    const streamEnergy =
      this.computeClassicPatternEnergy(
        sample.column,
        sample.row,
        sample.inverseDepth,
        sample.turbulence,
      ) *
      sample.sceneMask *
      (0.45 + sample.sceneFocus * 0.9) *
      (0.75 + sample.turbulence * 0.5);

    const shimmer =
      0.9 +
      0.1 *
        Math.sin(
          this.elapsedTime * 1.7 +
            sample.column * 0.22 +
            sample.row * 0.17 +
            sample.depth * 3.4,
        );
    const visibility = Math.min(
      1,
      (sample.worldSignal * (0.84 + sample.sceneFocus * 0.3) + streamEnergy * 0.62) * shimmer,
    );

    return {
      glyph: this.pickGlyph(
        sample.column,
        sample.row,
        visibility,
        sample.edge,
        sample.inverseDepth,
        sample.localAverage,
        streamEnergy,
        sample.turbulence,
      ),
      green: Math.floor(
        94 +
          visibility * 118 +
          sample.edge * 42 +
          sample.sceneFocus * 28 +
          streamEnergy * 92,
      ),
      alpha: Math.min(1, 0.16 + visibility * 0.74 + streamEnergy * 0.4),
    };
  }

  private paintRainGlyph(sample: GlyphSample, deltaTime: number): GlyphPaint {
    const rainMask = this.computeRainMask(
      sample.column,
      sample.row,
      sample.inverseDepth,
      sample.turbulence,
    );
    const persistenceIndex = sample.row * this.columns + sample.column;
    const storedMask = this.integrateRainMask(
      persistenceIndex,
      deltaTime,
      rainMask * sample.sceneMask,
      sample.sceneFocus,
    );
    const streamEnergy = Math.min(
      1,
      (rainMask * 0.72 + storedMask * 0.92) *
        sample.sceneMask *
        (0.5 + sample.sceneFocus * 0.78) *
        (0.78 + sample.turbulence * 0.35),
    );

    const shimmer =
      0.9 +
      0.1 *
        Math.sin(
          this.elapsedTime * 1.7 +
            sample.column * 0.22 +
            sample.row * 0.17 +
            sample.depth * 3.4,
        );
    const revealedWorld = Math.max(rainMask * sample.sceneMask, storedMask * sample.sceneMask * 0.92);
    const terrainPresence = revealedWorld * (0.3 + sample.edge * 0.9 + sample.sceneFocus * 0.28);
    const visibility = Math.min(
      1,
      (sample.worldSignal * 0.04 + terrainPresence * 0.62 + streamEnergy * 0.74) * shimmer,
    );

    return {
      glyph: this.pickRainGlyph(sample, visibility, streamEnergy),
      green: Math.floor(
        80 +
          visibility * 104 +
          sample.edge * 56 +
          sample.sceneFocus * 20 +
          streamEnergy * 118,
      ),
      alpha: Math.min(
        1,
        0.05 +
          terrainPresence * 0.24 +
          visibility * 0.34 +
          sample.edge * 0.18 +
          streamEnergy * 0.58,
      ),
    };
  }

  private pickGlyph(
    column: number,
    row: number,
    visibility: number,
    edge: number,
    inverseDepth: number,
    localAverage: number,
    streamEnergy: number,
    turbulence: number,
  ): string {
    const rampIndex = Math.min(
      GLYPH_RAMP.length - 1,
      Math.floor(
        (
          visibility * 0.48 +
          edge * 0.52 +
          inverseDepth * 0.12 +
          localAverage * 0.2 +
          streamEnergy * 0.5
        ) *
          GLYPH_RAMP.length,
      ),
    );

    if (streamEnergy > 0.06 || visibility > 0.58) {
      const phase = Math.floor(this.elapsedTime * (20 + streamEnergy * 36));
      const randomIndex = Math.floor(
        this.hash(column * 13 + phase, row * 17 + Math.floor(turbulence * 97), inverseDepth * 37.1) *
          MATRIX_CHARS.length,
      );
      return MATRIX_CHARS[randomIndex] ?? '0';
    }

    return GLYPH_RAMP[rampIndex];
  }

  private pickRainGlyph(sample: GlyphSample, visibility: number, streamEnergy: number): string {
    const rampIndex = Math.min(
      GLYPH_RAMP.length - 1,
      Math.floor(
        (
          visibility * 0.48 +
          sample.edge * 0.52 +
          sample.inverseDepth * 0.12 +
          sample.localAverage * 0.2 +
          streamEnergy * 0.5
        ) *
          GLYPH_RAMP.length,
      ),
    );

    if (streamEnergy > 0.06 || visibility > 0.58) {
      const columnSpeed = this.rainColumnSpeeds[sample.column] ?? 12;
      const phase = Math.floor(
        this.elapsedTime * (columnSpeed * 1.4 + streamEnergy * 18) -
          sample.row * (0.8 + streamEnergy * 1.6),
      );
      const randomIndex = Math.floor(
        this.hash(
          sample.column * 13 + phase,
          sample.row * 17 + Math.floor(sample.turbulence * 97),
          sample.inverseDepth * 37.1,
        ) * MATRIX_CHARS.length,
      );
      return MATRIX_CHARS[randomIndex] ?? '0';
    }

    return GLYPH_RAMP[rampIndex];
  }

  private resetModeState(): void {
    if (this.config.renderMode === 'rain') {
      this.initializeRainField();
      return;
    }

    this.rainPersistence = new Float32Array(0);
  }

  private initializeRainField(): void {
    this.rainColumnSpeeds = new Float32Array(this.columns);
    this.rainColumnLengths = new Float32Array(this.columns);
    this.rainColumnOffsets = new Float32Array(this.columns);
    this.rainColumnGaps = new Float32Array(this.columns);
    this.rainPersistence = new Float32Array(this.columns * this.rows);

    for (let column = 0; column < this.columns; column += 1) {
      const speedSeed = this.hash(column * 0.91, this.config.seed * 0.0007, 1.1);
      const lengthSeed = this.hash(column * 1.73, this.config.seed * 0.0013, 2.7);
      const gapSeed = this.hash(column * 2.41, this.config.seed * 0.0021, 4.3);
      const cycleLength = this.rows + (14 + lengthSeed * 28) + (1 + gapSeed * 8);

      this.rainColumnSpeeds[column] = 20 + speedSeed * 24;
      this.rainColumnLengths[column] = 14 + lengthSeed * 28;
      this.rainColumnGaps[column] = 1 + gapSeed * 8;
      this.rainColumnOffsets[column] =
        this.hash(column * 3.17, this.config.seed * 0.0037, 5.9) * cycleLength;
    }
  }

  private integrateRainMask(
    index: number,
    deltaTime: number,
    incomingMask: number,
    sceneFocus: number,
  ): number {
    const decayRate = 0.72 - sceneFocus * 0.18;
    const retained = Math.max(0, this.rainPersistence[index] - deltaTime * decayRate);
    const stored = Math.max(retained, incomingMask);
    this.rainPersistence[index] = stored;
    return stored;
  }

  private computeRainMask(
    column: number,
    row: number,
    inverseDepth: number,
    turbulence: number,
  ): number {
    const baseSpeed = this.rainColumnSpeeds[column] ?? 12;
    const baseLength = this.rainColumnLengths[column] ?? 12;
    const baseGap = this.rainColumnGaps[column] ?? 10;
    const baseOffset = this.rainColumnOffsets[column] ?? 0;
    let mask = 0;

    for (let layer = 0; layer < 3; layer += 1) {
      const layerPhaseSeed = this.hash(column * (2.3 + layer), this.config.seed * 0.0011, 7.1 + layer);
      const speed = baseSpeed * (1 + layer * 0.16);
      const length = baseLength * (0.72 + layer * 0.26);
      const gap = Math.max(0.8, baseGap * (0.42 + layer * 0.2));
      const cycleLength = this.rows + length + gap;
      const headY =
        ((this.elapsedTime * speed) + baseOffset + layerPhaseSeed * cycleLength) % cycleLength - length;
      const headDistance = headY - row;

      if (headDistance < 0 || headDistance > length) {
        continue;
      }

      const trail = 1 - headDistance / Math.max(1, length);
      const headGlow = Math.max(0, 1 - headDistance / 1.15);
      const neighborGlow = Math.max(0, 1 - Math.abs(row - headY) / Math.max(3.2, length * 0.28)) * 0.34;
      const flicker =
        0.9 +
        this.hash(
          column * (2.17 + layer * 0.37) + Math.floor(this.elapsedTime * (15 + turbulence * 10)),
          row * (0.41 + layer * 0.07),
          inverseDepth * (17.3 + layer * 2.4),
        ) *
          0.22;
      mask += trail * trail * flicker + headGlow * 1.05 + neighborGlow;
    }

    return Math.min(1, mask);
  }

  private computeClassicPatternEnergy(
    column: number,
    row: number,
    inverseDepth: number,
    turbulence: number,
  ): number {
    let energy = 0;

    for (let layer = 0; layer < 3; layer += 1) {
      const speed = 0.75 + layer * 0.38 + turbulence * 0.12;
      const phase = this.elapsedTime * (14 + layer * 8) * speed;
      const packetIndex = Math.floor(phase + column * (0.08 + layer * 0.02));
      const packetSeed = packetIndex * 19.13 + layer * 41.7 + inverseDepth * 7.3;

      const centerX =
        this.hash(packetSeed, layer * 2.1, inverseDepth * 9.7) * this.columns +
        Math.sin(this.elapsedTime * (1.6 + layer * 0.3) + row * 0.06 + packetSeed) * (1.5 + layer * 1.8);
      const width = 1.5 + this.hash(packetSeed, 3.7 + layer, 1.2) * (3.5 + layer * 1.8);
      const headY =
        ((phase * (1.4 + layer * 0.4)) + this.hash(packetSeed, 8.1, 5.4) * this.rows) % this.rows;
      const length = 3 + this.hash(packetSeed, 11.4, 9.8) * (6 + layer * 4);
      const spread = Math.max(0, 1 - Math.abs(column - centerX) / width);

      if (spread <= 0) {
        continue;
      }

      const distance = (row - headY + this.rows) % this.rows;

      if (distance > length) {
        continue;
      }

      const trail = 1 - distance / length;
      energy += spread * spread * trail * trail;
    }

    const freckles = this.hash(
      column * 1.7 + Math.floor(this.elapsedTime * 48),
      row * 1.2 + Math.floor(this.elapsedTime * 36),
      inverseDepth * 13.1,
    );

    if (freckles > 0.82) {
      energy += (freckles - 0.82) * 1.6;
    }

    return Math.min(1, energy);
  }

  private computeTurbulence(column: number, row: number, depth: number): number {
    const phase = Math.floor(this.elapsedTime * 24);
    return this.hash(column * 0.73 + phase * 0.11, row * 1.19 + phase * 0.17, depth * 11.7);
  }

  private computeNeighborhoodBrightness(x: number, y: number, width: number, height: number): number {
    let total = 0;
    let count = 0;

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const sampleX = Math.min(width - 1, Math.max(0, x + offsetX));
        const sampleY = Math.min(height - 1, Math.max(0, y + offsetY));
        total += this.readBrightness(this.getPixelIndex(sampleX, sampleY, width, height));
        count += 1;
      }
    }

    return total / count;
  }

  private computeEdge(x: number, y: number, width: number, height: number): number {
    const left = this.readBrightness(this.getPixelIndex(Math.max(0, x - 1), y, width, height));
    const right = this.readBrightness(this.getPixelIndex(Math.min(width - 1, x + 1), y, width, height));
    const up = this.readBrightness(this.getPixelIndex(x, Math.max(0, y - 1), width, height));
    const down = this.readBrightness(this.getPixelIndex(x, Math.min(height - 1, y + 1), width, height));
    return Math.min(1, Math.abs(left - right) + Math.abs(up - down));
  }

  private getPixelIndex(x: number, y: number, width: number, height: number): number {
    return (((height - 1 - y) * width) + x) * 4;
  }

  private readBrightness(pixelIndex: number): number {
    const r = this.colorPixels[pixelIndex];
    const g = this.colorPixels[pixelIndex + 1];
    const b = this.colorPixels[pixelIndex + 2];
    return (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
  }

  private readDepth(pixelIndex: number): number {
    return this.depthPixels[pixelIndex] / 255;
  }

  private hash(x: number, y: number, z: number): number {
    const value = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
    return value - Math.floor(value);
  }
}
