import { clamp, lerp, normalizeAngle, lerpAngle, kmhToMs, deg2rad } from './utils/MathUtils';
import type { InputState } from './InputManager';

/* ── Tunable configuration ── */
export const CAR_CONFIG = {
    mass: 1400,
    maxSpeed: kmhToMs(185),           // ~51.4 m/s
    maxReverseSpeed: kmhToMs(30),
    wheelbase: 2.6,                    // metres

    /* Acceleration: 0-100 ~3s, asymptotic toward max */
    accelForce: 28,                    // m/s²  peak
    accelCurveExp: 1.8,                // higher = more asymptotic

    /* Braking */
    brakeForce: 38,                    // total m/s²
    brakeFrontRatio: 0.70,             // 70% front
    brakeRearRatio: 0.30,              // 30% rear

    /* Grip */
    baseFrontGrip: 0.95,
    baseRearGrip: 0.82,

    /* Steering (speed-dependent) */
    maxSteerAngleLow: deg2rad(38),     // at 0 km/h
    maxSteerAngleHigh: deg2rad(12),    // at max speed

    /* Body rotation assist — arcade magic */
    bodyRotationAssist: 0.22,
    brakeOversteerFactor: 0.30,

    /* Weight transfer */
    maxWeightTransfer: 0.14,
    weightTransferSpeed: 8,

    /* Drift */
    driftThreshold: 0.18,              // radians (~10°)
    driftPenaltyThreshold: 1.8,        // seconds before penalty
    driftPenaltyRate: 0.04,
    driftPenaltyMax: 0.12,

    /* Hidden spin limiter */
    spinLimiterMax: 3.0,               // rad/s
    spinLimiterSoftStart: 0.75,        // starts at 75% of max

    /* Traction assist */
    tractionAssist: 2.5,

    /* Drag */
    dragCoefficient: 0.35,
    rollingResistance: 0.8,

    /* Off-road */
    offRoadDrag: 4.0,

    /* Grip correction: how fast travel dir follows heading */
    gripCorrectionSpeed: 6.0,
};

/* ── Physics state ── */
export interface CarState {
    px: number; py: number; pz: number;
    heading: number;          // body heading (visual)
    travelDir: number;        // actual movement direction
    speed: number;            // m/s forward
    weightFront: number;
    driftAngle: number;
    driftTimer: number;
    isDrifting: boolean;
    rpm: number;              // 0-1 for audio
    isOnRoad: boolean;
}

export function createCarState(x = 0, z = 0, heading = 0): CarState {
    return {
        px: x, py: 0, pz: z,
        heading, travelDir: heading,
        speed: 0, weightFront: 0.5,
        driftAngle: 0, driftTimer: 0,
        isDrifting: false, rpm: 0, isOnRoad: true,
    };
}

/**
 * Core arcade physics update.
 * Returns nothing — mutates `state` in place.
 */
export function updateCarPhysics(
    state: CarState,
    input: InputState,
    dt: number,
    surfaceGrip: number = 1.0,
): void {
    const C = CAR_CONFIG;
    const speedRatio = clamp(state.speed / C.maxSpeed, 0, 1);

    /* ── Weight Transfer ── */
    const wtTarget = 0.5
        + input.brake * C.maxWeightTransfer
        - input.throttle * C.maxWeightTransfer * 0.4;
    state.weightFront = lerp(state.weightFront, clamp(wtTarget, 0.35, 0.65), C.weightTransferSpeed * dt);

    /* ── Dynamic Grip ── */
    const wRear = 1 - state.weightFront;
    const frontGrip = C.baseFrontGrip * (state.weightFront / 0.5) * surfaceGrip;
    const rearGrip = C.baseRearGrip * (wRear / 0.5) * surfaceGrip;

    /* ── Acceleration (non-linear curve) ── */
    if (input.throttle > 0.01 && state.speed >= 0) {
        const factor = 1 - Math.pow(speedRatio, C.accelCurveExp);
        state.speed += input.throttle * C.accelForce * factor * dt;
    }

    /* ── Braking ── */
    if (input.brake > 0.01 && state.speed > 0) {
        const fb = input.brake * C.brakeForce * C.brakeFrontRatio * (state.weightFront / 0.5);
        const rb = input.brake * C.brakeForce * C.brakeRearRatio * (wRear / 0.5);
        state.speed -= (fb + rb) * dt;
        if (state.speed < 0) state.speed = 0;
    }

    /* ── Drag ── */
    state.speed -= state.speed * C.dragCoefficient * dt;
    state.speed -= C.rollingResistance * dt;
    if (state.speed < 0.05) state.speed = 0;

    /* ── Off-road extra drag ── */
    if (!state.isOnRoad) {
        state.speed -= state.speed * C.offRoadDrag * dt;
    }

    /* ── Steering ── */
    const maxSteer = lerp(C.maxSteerAngleLow, C.maxSteerAngleHigh, speedRatio);
    const steerAngle = input.steer * maxSteer;

    let turnRate = 0;
    if (state.speed > 0.5) {
        turnRate = (steerAngle / C.wheelbase) * Math.min(state.speed, C.maxSpeed * 0.85);
        turnRate *= Math.min(1, frontGrip);
    }

    /* ── Body Rotation Assist ── */
    if (input.throttle > 0.2 && Math.abs(input.steer) > 0.15) {
        turnRate *= (1 + C.bodyRotationAssist * input.throttle);
    }

    /* ── Brake Oversteer ── */
    if (input.brake > 0.25 && Math.abs(input.steer) > 0.1) {
        turnRate *= (1 + input.brake * Math.abs(input.steer) * C.brakeOversteerFactor);
    }

    /* ── Update Heading ── */
    state.heading += turnRate * dt;

    /* ── Travel Direction follows Heading via Grip ── */
    const headingDelta = normalizeAngle(state.heading - state.travelDir);
    state.travelDir += headingDelta * rearGrip * C.gripCorrectionSpeed * dt;

    /* ── Drift ── */
    state.driftAngle = normalizeAngle(state.heading - state.travelDir);
    state.isDrifting = Math.abs(state.driftAngle) > C.driftThreshold;

    if (state.isDrifting) {
        state.driftTimer += dt;
    } else {
        state.driftTimer = Math.max(0, state.driftTimer - dt * 3);
    }

    /* Drift speed penalty (long drift) */
    if (state.driftTimer > C.driftPenaltyThreshold) {
        const pen = Math.min(C.driftPenaltyMax,
            (state.driftTimer - C.driftPenaltyThreshold) * C.driftPenaltyRate);
        state.speed *= (1 - pen * dt);
    }

    /* ── HIDDEN SPIN LIMITER ── */
    const absDA = Math.abs(state.driftAngle);
    const softCap = C.spinLimiterMax * C.spinLimiterSoftStart;
    if (absDA > softCap) {
        const excess = absDA - softCap;
        const maxExcess = C.spinLimiterMax * (1 - C.spinLimiterSoftStart);
        const damping = clamp(excess / maxExcess, 0, 1) * 0.65;
        state.heading = lerpAngle(state.heading, state.travelDir + Math.sign(state.driftAngle) * softCap, damping * dt * 5);
    }

    /* ── Traction Assist (non-drift gentle correction) ── */
    if (!state.isDrifting && Math.abs(state.driftAngle) > 0.03) {
        state.travelDir += state.driftAngle * C.tractionAssist * dt;
    }

    /* ── RPM (audio) ── */
    state.rpm = clamp(speedRatio * 0.75 + input.throttle * 0.25, 0, 1);

    /* ── Position Update ── */
    const moveAngle = state.travelDir;
    state.px += Math.sin(moveAngle) * state.speed * dt;
    state.pz += Math.cos(moveAngle) * state.speed * dt;

    state.speed = clamp(state.speed, 0, C.maxSpeed);
}
