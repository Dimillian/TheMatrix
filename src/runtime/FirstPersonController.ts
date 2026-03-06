import * as THREE from 'three';
import type { GameConfig } from '../types.ts';
import type { InputController } from './InputController.ts';

export class FirstPersonController {
  private readonly config: GameConfig;
  readonly position = new THREE.Vector3(0, 0, 0);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly lookDirection = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly move = new THREE.Vector3();

  yaw = 0;
  pitch = 0;

  private bobTime = 0;

  constructor(config: GameConfig) {
    this.config = config;
  }

  setSpawn(x: number, z: number, height: number): void {
    this.position.set(x, height + this.config.eyeHeight, z);
  }

  update(
    deltaTime: number,
    input: InputController,
    sampleHeight: (x: number, z: number) => number,
    canOccupy?: (x: number, z: number) => boolean,
  ): void {
    const look = input.consumeLookDelta();
    this.yaw -= look.x * this.config.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - look.y * this.config.mouseSensitivity,
      -this.config.maxPitch,
      this.config.maxPitch,
    );

    this.lookDirection.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    this.forward.copy(this.lookDirection).projectOnPlane(this.up);
    if (this.forward.lengthSq() < 0.0001) {
      this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }
    this.forward.normalize();

    this.right.crossVectors(this.forward, this.up).normalize();

    this.move.set(0, 0, 0);
    this.move.addScaledVector(this.forward, input.movementZ);
    this.move.addScaledVector(this.right, input.movementX);

    if (this.move.lengthSq() > 1) {
      this.move.normalize();
    }

    const travelDistance = this.config.moveSpeed * deltaTime;
    const targetX = this.position.x + this.move.x * travelDistance;
    const targetZ = this.position.z + this.move.z * travelDistance;

    if (canOccupy) {
      if (canOccupy(targetX, this.position.z)) {
        this.position.x = targetX;
      }

      if (canOccupy(this.position.x, targetZ)) {
        this.position.z = targetZ;
      }
    } else {
      this.position.x = targetX;
      this.position.z = targetZ;
    }

    const groundHeight = sampleHeight(this.position.x, this.position.z);
    const targetY = groundHeight + this.config.eyeHeight;
    this.position.y = THREE.MathUtils.lerp(this.position.y, targetY, Math.min(1, deltaTime * 12));

    if (this.move.lengthSq() > 0.001) {
      this.bobTime += deltaTime * 9;
    } else {
      this.bobTime = THREE.MathUtils.lerp(this.bobTime, 0, Math.min(1, deltaTime * 6));
    }
  }

  getCameraBobOffset(): number {
    return Math.sin(this.bobTime) * 0.12;
  }
}
