export class InputController {
  private readonly lockTarget: HTMLElement;
  private readonly pressed = new Set<string>();
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private pointerLocked = false;
  private pointerLockError: string | null = null;

  onPointerLockChange?: (locked: boolean) => void;
  onPointerLockError?: (message: string) => void;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.pressed.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) {
      return;
    }

    this.lookDeltaX += event.movementX;
    this.lookDeltaY += event.movementY;
  };

  private readonly handlePointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.lockTarget;
    this.pointerLockError = null;
    if (!this.pointerLocked) {
      this.lookDeltaX = 0;
      this.lookDeltaY = 0;
    }
    this.onPointerLockChange?.(this.pointerLocked);
  };

  private readonly handlePointerLockError = (): void => {
    this.pointerLocked = false;
    this.pointerLockError = 'Pointer lock was blocked by the browser. Click the game area again after focusing the page.';
    this.onPointerLockError?.(this.pointerLockError);
  };

  constructor(lockTarget: HTMLElement) {
    this.lockTarget = lockTarget;
    this.lockTarget.tabIndex = 0;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
  }

  requestPointerLock(): void {
    this.pointerLockError = null;
    void this.lockTarget.requestPointerLock();
  }

  get movementX(): number {
    return Number(this.isPressed('KeyD')) - Number(this.isPressed('KeyA'));
  }

  get movementZ(): number {
    return Number(this.isPressed('KeyW')) - Number(this.isPressed('KeyS'));
  }

  get locked(): boolean {
    return this.pointerLocked;
  }

  get error(): string | null {
    return this.pointerLockError;
  }

  consumeLookDelta(): { x: number; y: number } {
    const delta = {
      x: this.lookDeltaX,
      y: this.lookDeltaY,
    };

    this.lookDeltaX = 0;
    this.lookDeltaY = 0;

    return delta;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
  }

  private isPressed(code: string): boolean {
    return this.pressed.has(code);
  }
}
