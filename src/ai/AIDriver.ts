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
    { t: 0.00, speedFactor: 0.80 },
    { t: 0.12, speedFactor: 0.85 },
    { t: 0.20, speedFactor: 0.70 },
    { t: 0.30, speedFactor: 0.60 },
    { t: 0.38, speedFactor: 0.70 },
    { t: 0.50, speedFactor: 0.85 },
    { t: 0.62, speedFactor: 0.85 },
    { t: 0.70, speedFactor: 0.70 },
    { t: 0.80, speedFactor: 0.60 },
    { t: 0.88, speedFactor: 0.70 },
    { t: 1.00, speedFactor: 0.80 },
];

const AGGRESSIVE_PROFILE: SpeedNode[] = [
    { t: 0.00, speedFactor: 0.90 },
    { t: 0.12, speedFactor: 0.93 },
    { t: 0.20, speedFactor: 0.80 },
    { t: 0.30, speedFactor: 0.70 },
    { t: 0.38, speedFactor: 0.82 },
    { t: 0.50, speedFactor: 0.93 },
    { t: 0.62, speedFactor: 0.93 },
    { t: 0.70, speedFactor: 0.80 },
    { t: 0.80, speedFactor: 0.70 },
    { t: 0.88, speedFactor: 0.82 },
    { t: 1.00, speedFactor: 0.90 },
];

/* ── Turn zones: t-ranges where we're in a corner ── */
const TURN_ZONES: [number, number][] = [
    [0.18, 0.40], // Turn 1
    [0.68, 0.90], // Turn 2
];

function isInTurn(t: number): boolean {
    for (const [start, end] of TURN_ZONES) {
        if (t >= start && t <= end) return true;
    }
    return false;
}

/* ── Error types ── */
enum ErrorType {
    Steering,    // random steering offset
    LateBrake,   // fails to slow down for corner
    Slowdown,    // unexpected speed loss (tyre issue)
}

/**
 * AI Driver controller. Drives a Car by generating InputState each frame.
 * Now with more frequent and impactful mistakes for passing opportunities.
 */
export class AIDriver {
    readonly type: AIType;
    private profile: SpeedNode[];

    // Error system
    private errorTimer = 0;
    private errorActive = false;
    private errorSteer = 0;
    private errorType: ErrorType = ErrorType.Steering;
    private errorRecoveryTimer = 0; // time to recover after error

    // Cooldown: prevent errors too close together
    private errorCooldown = 0;

    /** For Adaptive: target lap time */
    private targetLapTime = 55;

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

        let steer = clamp(-angleDiff * 3, -1, 1);

        // ── Error system — all AI types make mistakes ──
        this.errorCooldown -= dt;

        let errorChance = 0;
        let errorMagnitude = 0;
        let errorDuration = 0;

        // Base error parameters per type
        switch (this.type) {
            case AIType.Consistent:
                errorChance = 0.008;
                errorMagnitude = 0.4;
                errorDuration = 0.5;
                break;
            case AIType.Aggressive:
                errorChance = 0.025;
                errorMagnitude = 1.0;
                errorDuration = 0.8;
                break;
            case AIType.Adaptive:
                errorChance = 0.015;
                errorMagnitude = 0.6;
                errorDuration = 0.6;
                break;
        }

        // In turns, errors are 2.5x more likely
        if (isInTurn(t)) {
            errorChance *= 2.5;
        }

        // Last lap pressure: Adaptive makes more errors
        if (this.type === AIType.Adaptive && currentLap >= totalLaps) {
            errorChance *= 1.8;
            errorMagnitude *= 1.3;
        }

        // Trigger new error
        if (this.errorCooldown <= 0 && !this.errorActive && Math.random() < errorChance) {
            this.errorActive = true;

            // Choose error type based on context
            const roll = Math.random();
            if (isInTurn(t) && roll < 0.4) {
                // Late brake error in turns
                this.errorType = ErrorType.LateBrake;
                this.errorSteer = (Math.random() - 0.5) * errorMagnitude * 0.5;
                this.errorTimer = errorDuration + Math.random() * 0.8;
            } else if (!isInTurn(t) && roll < 0.2) {
                // Random slowdown on straights
                this.errorType = ErrorType.Slowdown;
                this.errorSteer = 0;
                this.errorTimer = 0.8 + Math.random() * 1.2;
            } else {
                // Steering error (default)
                this.errorType = ErrorType.Steering;
                this.errorSteer = (Math.random() - 0.5) * errorMagnitude;
                this.errorTimer = errorDuration + Math.random() * 0.5;
            }

            // Set cooldown so errors don't happen back-to-back
            this.errorCooldown = 3.0 + Math.random() * 5.0;
        }

        // Apply active error
        let speedMultiplier = 1.0;
        if (this.errorActive) {
            this.errorTimer -= dt;

            switch (this.errorType) {
                case ErrorType.Steering:
                    steer += this.errorSteer;
                    break;
                case ErrorType.LateBrake:
                    // Carry too much speed into corner + steering offset
                    speedMultiplier = 1.15; // overshooting speed target
                    steer += this.errorSteer;
                    break;
                case ErrorType.Slowdown:
                    // Unexpected speed loss
                    speedMultiplier = 0.6;
                    break;
            }

            if (this.errorTimer <= 0) {
                this.errorActive = false;
                // Recovery period: takes time to get back on ideal line
                this.errorRecoveryTimer = 1.0 + Math.random() * 1.5;
            }
        }

        // Recovery: slightly worse performance while recovering
        if (this.errorRecoveryTimer > 0) {
            this.errorRecoveryTimer -= dt;
            speedMultiplier *= 0.92; // still slower while recovering
        }

        // ── Throttle / Brake ──
        const adjustedTargetSpeed = targetSpeed * speedMultiplier;
        const currentSpeed = this.car.state.speed;
        const speedErr = adjustedTargetSpeed - currentSpeed;

        let throttle = 0, brake = 0;
        if (speedErr > 1) {
            throttle = clamp(speedErr / 10, 0.2, 1);
        } else if (speedErr < -2) {
            brake = clamp(-speedErr / 15, 0.1, 0.8);
        } else {
            throttle = 0.3; // cruise
        }

        return { throttle, brake, steer: clamp(steer, -1, 1), handbrake: false };
    }

    private getTargetSpeed(t: number, playerCar: Car, currentLap: number, totalLaps: number): number {
        let baseFactor = this.interpolateProfile(t);

        if (this.type === AIType.Adaptive) {
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
            // Match player's average pace
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
