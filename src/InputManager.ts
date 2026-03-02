import { clamp } from './utils/MathUtils';

export interface InputState {
    throttle: number;   // 0–1
    brake: number;      // 0–1
    steer: number;      // -1 (left) to 1 (right)
}

/**
 * Reads keyboard and gamepad inputs.
 * Analog support via Gamepad API; keyboard uses digital-to-analog smoothing.
 * Also provides gamepad button state for menu navigation.
 */
export class InputManager {
    private keys = new Set<string>();
    private pad: Gamepad | null = null;

    /* digital-to-analog smoothed values */
    private kThrottle = 0;
    private kBrake = 0;
    private kSteer = 0;

    private readonly SMOOTH_UP = 6;   // ramp-up per second
    private readonly SMOOTH_DOWN = 8; // ramp-down per second

    /* Gamepad button edge detection */
    private prevButtons: boolean[] = [];

    constructor() {
        window.addEventListener('keydown', e => this.keys.add(e.code));
        window.addEventListener('keyup', e => this.keys.delete(e.code));
        window.addEventListener('gamepadconnected', e => {
            this.pad = navigator.getGamepads()[e.gamepad.index];
        });
        window.addEventListener('gamepaddisconnected', () => { this.pad = null; });
    }

    /** Refresh the gamepad snapshot — must be called before reading buttons */
    private refreshPad() {
        if (this.pad) {
            const pads = navigator.getGamepads();
            if (pads[this.pad.index]) this.pad = pads[this.pad.index];
        }
    }

    update(dt: number): InputState {
        this.refreshPad();

        /* ── Gamepad (analog) ── */
        if (this.pad) {
            const axes = this.pad.axes;
            const buttons = this.pad.buttons;
            return {
                throttle: clamp(buttons[7]?.value ?? 0, 0, 1),  // RT
                brake: clamp(buttons[6]?.value ?? 0, 0, 1),   // LT
                steer: clamp(axes[0] ?? 0, -1, 1),            // Left stick X
            };
        }

        /* ── Keyboard (smoothed digital) ── */
        const wantThrottle = this.keys.has('ArrowUp') || this.keys.has('KeyW') ? 1 : 0;
        const wantBrake = this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0;
        const wantLeft = this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? -1 : 0;
        const wantRight = this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0;
        const wantSteer = wantLeft + wantRight;

        this.kThrottle = this.ramp(this.kThrottle, wantThrottle, dt);
        this.kBrake = this.ramp(this.kBrake, wantBrake, dt);
        this.kSteer = this.ramp(this.kSteer, wantSteer, dt);

        return {
            throttle: this.kThrottle,
            brake: this.kBrake,
            steer: this.kSteer,
        };
    }

    /**
     * Returns true the frame a gamepad button is first pressed (edge-triggered).
     * Standard mapping: 0=A, 1=B, 9=Start/Options, 12=DpadUp, 13=DpadDown
     */
    isButtonJustPressed(index: number): boolean {
        this.refreshPad();
        if (!this.pad) return false;
        const pressed = this.pad.buttons[index]?.pressed ?? false;
        const wasPrev = this.prevButtons[index] ?? false;
        return pressed && !wasPrev;
    }

    /** Must be called at end of frame to track button edges */
    updatePrevButtons() {
        if (!this.pad) {
            this.prevButtons = [];
            return;
        }
        this.prevButtons = this.pad.buttons.map(b => b.pressed);
    }

    /** Whether a gamepad is connected */
    get hasGamepad(): boolean {
        return this.pad !== null;
    }

    private ramp(current: number, target: number, dt: number): number {
        if (current < target) return clamp(current + this.SMOOTH_UP * dt, current, target);
        if (current > target) return clamp(current - this.SMOOTH_DOWN * dt, target, current);
        return current;
    }
}
