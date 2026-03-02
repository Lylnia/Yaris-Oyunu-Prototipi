// AI Driver system
import { Car } from '../entities/Car';
import { Track } from '../track/Track';
import { InputState } from '../InputManager';
import { clamp, lerp, kmhToMs } from '../utils/MathUtils';
import { CAR_CONFIG } from '../physics/CarPhysics';

/* ── AI Type enum ── */
export enum AIType {
    /** Ideal line, no errors, slow — teaches the player */
    Consistent = 1,
    /** Late brakes, risky overtakes, occasional errors */
    Aggressive = 2,
    /** Adapts to player tempo, pressures in final laps */
    Adaptive = 3,
}

/* ── Speed profile for AI (fraction of max speed at each track section) ── */
interface SpeedNode { t: number; speedFactor: number; }

const CONSISTENT_PROFILE: SpeedNode[] = [
    // Oval: right straight → turn 1 (top) → left straight → turn 2 (bottom)
    { t: 0.00, speedFactor: 0.80 },  // right straight start
    { t: 0.12, speedFactor: 0.85 },  // right straight mid
    { t: 0.20, speedFactor: 0.70 },  // entering turn 1
    { t: 0.30, speedFactor: 0.60 },  // turn 1 apex
    { t: 0.38, speedFactor: 0.70 },  // exiting turn 1
    { t: 0.50, speedFactor: 0.85 },  // left straight mid
    { t: 0.62, speedFactor: 0.85 },  // left straight end
    { t: 0.70, speedFactor: 0.70 },  // entering turn 2
    { t: 0.80, speedFactor: 0.60 },  // turn 2 apex
    { t: 0.88, speedFactor: 0.70 },  // exiting turn 2
    { t: 1.00, speedFactor: 0.80 },
];

const AGGRESSIVE_PROFILE: SpeedNode[] = [
    { t: 0.00, speedFactor: 0.90 },
    { t: 0.12, speedFactor: 0.93 },
    { t: 0.20, speedFactor: 0.80 },  // late brake
    { t: 0.30, speedFactor: 0.70 },  // turn 1
    { t: 0.38, speedFactor: 0.82 },
    { t: 0.50, speedFactor: 0.93 },
    { t: 0.62, speedFactor: 0.93 },
    { t: 0.70, speedFactor: 0.80 },  // late brake turn 2
    { t: 0.80, speedFactor: 0.70 },
    { t: 0.88, speedFactor: 0.82 },
    { t: 1.00, speedFactor: 0.90 },
];

/**
 * AI Driver controller. Drives a Car by generating InputState each frame.
 */
export class AIDriver {
    readonly type: AIType;
    private profile: SpeedNode[];
    private errorTimer = 0;
    private errorActive = false;
    private errorSteer = 0;
    /** For Adaptive: target lap time */
    private targetLapTime = 55; // seconds (oval lap)

    constructor(readonly car: Car, type: AIType, private track: Track) {
        this.type = type;
        switch (type) {
            case AIType.Consistent: this.profile = CONSISTENT_PROFILE; break;
            case AIType.Aggressive: this.profile = AGGRESSIVE_PROFILE; break;
            case AIType.Adaptive: this.profile = [...CONSISTENT_PROFILE]; break;
        }
    }

    /** Call after player completes a lap to update Adaptive AI */
    onPlayerLapComplete(playerLapTime: number) {
        if (this.type === AIType.Adaptive) {
            this.targetLapTime = playerLapTime * 0.985;
        }
    }

    update(dt: number, playerCar: Car, currentLap: number, totalLaps: number): InputState {
        const t = this.car.trackT;
        const targetSpeed = this.getTargetSpeed(t, playerCar, currentLap, totalLaps);

        // ── Steer toward next point on ideal line ──
        const lookAhead = (t + 0.02) % 1;
        const target = this.track.getPointAt(lookAhead);
        const dx = target.pos.x - this.car.state.px;
        const dz = target.pos.z - this.car.state.pz;
        const targetAngle = Math.atan2(dx, dz);
        let angleDiff = targetAngle - this.car.state.heading;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Negate steer to match physics convention (steerAngle is negated in physics)
        let steer = clamp(-angleDiff * 3, -1, 1);

        // ── Aggressive: random errors ──
        if (this.type === AIType.Aggressive) {
            this.errorTimer -= dt;
            if (this.errorTimer <= 0 && !this.errorActive) {
                if (Math.random() < 0.008) {
                    this.errorActive = true;
                    this.errorSteer = (Math.random() - 0.5) * 0.6;
                    this.errorTimer = 0.4 + Math.random() * 0.8;
                }
            }
            if (this.errorActive) {
                steer += this.errorSteer;
                this.errorTimer -= dt;
                if (this.errorTimer <= 0) this.errorActive = false;
            }
        }

        // ── Throttle / Brake ──
        const currentSpeed = this.car.state.speed;
        const speedErr = targetSpeed - currentSpeed;

        let throttle = 0, brake = 0;
        if (speedErr > 1) {
            throttle = clamp(speedErr / 10, 0.2, 1);
        } else if (speedErr < -2) {
            brake = clamp(-speedErr / 15, 0.1, 0.8);
        } else {
            throttle = 0.3; // cruise
        }

        return { throttle, brake, steer: clamp(steer, -1, 1) };
    }

    private getTargetSpeed(t: number, playerCar: Car, currentLap: number, totalLaps: number): number {
        let baseFactor = this.interpolateProfile(t);

        if (this.type === AIType.Adaptive) {
            // Adjust speed based on player performance
            const playerSpeed = playerCar.state.speed;
            const playerT = playerCar.trackT;
            const gap = t - playerT;

            // If behind player, speed up
            if (gap < -0.02 && gap > -0.5) {
                baseFactor *= 1.06;
            }
            // If ahead, slow slightly to keep close
            if (gap > 0.02 && gap < 0.5) {
                baseFactor *= 0.96;
            }
            // Final lap pressure
            if (currentLap >= totalLaps) {
                baseFactor *= 1.04;
            }
            // Match player's average pace via target lap time
            const paceRatio = 150 / Math.max(this.targetLapTime, 60);
            baseFactor *= lerp(1, paceRatio, 0.5);
        }

        return CAR_CONFIG.maxSpeed * clamp(baseFactor, 0.25, 0.98);
    }

    private interpolateProfile(t: number): number {
        const p = this.profile;
        for (let i = 0; i < p.length - 1; i++) {
            if (t >= p[i].t && t < p[i + 1].t) {
                const frac = (t - p[i].t) / (p[i + 1].t - p[i].t);
                return lerp(p[i].speedFactor, p[i + 1].speedFactor, frac);
            }
        }
        return p[p.length - 1].speedFactor;
    }
}
