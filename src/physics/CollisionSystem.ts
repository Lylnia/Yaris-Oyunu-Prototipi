import { Car } from '../entities/Car';

/**
 * OBB (Oriented Bounding Box) collision using Separating Axis Theorem.
 * Uses EXACT car dimensions from CarModel: 1.8m wide × 4.2m long.
 * Separate physics for player-AI vs AI-AI collisions.
 */

// Exact half-dimensions from CarModel BoxGeometry(1.8, 0.5, 4.2)
const HALF_WIDTH = 0.9;             // 1.8 / 2
const HALF_LENGTH = 2.1;            // 4.2 / 2

const PUSH_FORCE = 0.85;
const SPEED_LOSS_PLAYER = 0.75;
const SPEED_LOSS_AI = 0.96;
const BOUNCE_FACTOR = 0.25;

/** 2D corner of a car's OBB in XZ plane */
function getCorners(px: number, pz: number, heading: number): [number, number][] {
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);

    // Local corners → world (rotated by heading)
    const hw = HALF_WIDTH;
    const hl = HALF_LENGTH;

    return [
        [px + sinH * hl + cosH * hw, pz + cosH * hl - sinH * hw],  // front-right
        [px + sinH * hl - cosH * hw, pz + cosH * hl + sinH * hw],  // front-left
        [px - sinH * hl - cosH * hw, pz - cosH * hl + sinH * hw],  // rear-left
        [px - sinH * hl + cosH * hw, pz - cosH * hl - sinH * hw],  // rear-right
    ];
}

/** Get the 2 unique edge normals (axes) for a car's OBB */
function getAxes(heading: number): [number, number][] {
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);
    return [
        [sinH, cosH],   // forward axis
        [cosH, -sinH],  // right axis
    ];
}

/** Project corners onto an axis, return [min, max] */
function project(corners: [number, number][], axis: [number, number]): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (const [cx, cz] of corners) {
        const dot = cx * axis[0] + cz * axis[1];
        if (dot < min) min = dot;
        if (dot > max) max = dot;
    }
    return [min, max];
}

/** SAT overlap test — returns overlap amount on the minimum axis, or 0 if no collision */
function obbOverlap(
    cornersA: [number, number][],
    cornersB: [number, number][],
    axesA: [number, number][],
    axesB: [number, number][],
): { overlap: number; axisX: number; axisZ: number } | null {
    let minOverlap = Infinity;
    let minAxisX = 0;
    let minAxisZ = 0;

    const allAxes = [...axesA, ...axesB];

    for (const axis of allAxes) {
        const [minA, maxA] = project(cornersA, axis);
        const [minB, maxB] = project(cornersB, axis);

        // Check for gap
        if (maxA < minB || maxB < minA) {
            return null; // no collision
        }

        // Calculate overlap
        const overlap = Math.min(maxA - minB, maxB - minA);
        if (overlap < minOverlap) {
            minOverlap = overlap;
            minAxisX = axis[0];
            minAxisZ = axis[1];
        }
    }

    // Ensure push direction is from B to A
    return { overlap: minOverlap, axisX: minAxisX, axisZ: minAxisZ };
}

export function resolveCarCollisions(cars: Car[]): void {
    for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
            const carA = cars[i];
            const carB = cars[j];
            const a = carA.state;
            const b = carB.state;

            // Quick distance check first (skip if obviously far apart)
            const dx = a.px - b.px;
            const dz = a.pz - b.pz;
            const quickDist = dx * dx + dz * dz;
            const maxReach = (HALF_LENGTH + HALF_WIDTH) * 2;
            if (quickDist > maxReach * maxReach) continue;

            // Full OBB test
            const cornersA = getCorners(a.px, a.pz, a.heading);
            const cornersB = getCorners(b.px, b.pz, b.heading);
            const axesA = getAxes(a.heading);
            const axesB = getAxes(b.heading);

            const result = obbOverlap(cornersA, cornersB, axesA, axesB);
            if (!result) continue;

            const { overlap, axisX, axisZ } = result;

            // Determine push direction (from B toward A)
            const centerDx = a.px - b.px;
            const centerDz = a.pz - b.pz;
            const dot = centerDx * axisX + centerDz * axisZ;
            const sign = dot >= 0 ? 1 : -1;
            const nx = axisX * sign;
            const nz = axisZ * sign;

            // Push apart
            const pushHalf = overlap * PUSH_FORCE * 0.5;
            a.px += nx * pushHalf;
            a.pz += nz * pushHalf;
            b.px -= nx * pushHalf;
            b.pz -= nz * pushHalf;

            // Different physics for player-AI vs AI-AI
            const playerInvolved = carA.isPlayer || carB.isPlayer;
            const speedLoss = playerInvolved ? SPEED_LOSS_PLAYER : SPEED_LOSS_AI;

            a.speed *= speedLoss;
            b.speed *= speedLoss;

            // Heading bounce only for player collisions
            if (playerInvolved) {
                const aSpd = Math.abs(a.speed);
                const bSpd = Math.abs(b.speed);

                if (aSpd > 1) {
                    a.heading += nx * BOUNCE_FACTOR * 0.12;
                    a.travelDir += nx * BOUNCE_FACTOR * 0.08;
                }
                if (bSpd > 1) {
                    b.heading -= nx * BOUNCE_FACTOR * 0.12;
                    b.travelDir -= nx * BOUNCE_FACTOR * 0.08;
                }
            }
        }
    }
}
