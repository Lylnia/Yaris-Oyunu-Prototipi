import { CarState } from './CarPhysics';

/**
 * Simple circle-circle collision between all car-like entities.
 * Each entity has a position (px, pz), speed, heading, and a collision radius.
 */
export interface Collidable {
    px: number;
    pz: number;
    speed: number;
    heading: number;
    travelDir: number;
}

const CAR_RADIUS = 2.2; // metres
const PUSH_STRENGTH = 0.85;
const SPEED_LOSS = 0.3; // fraction of speed lost on collision

/**
 * Resolves collisions between all pairs of collidable entities.
 * Mutates positions and speeds in place.
 */
export function resolveCollisions(entities: Collidable[], invulnerable?: Set<number>): void {
    for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
            const a = entities[i];
            const b = entities[j];

            const dx = b.px - a.px;
            const dz = b.pz - a.pz;
            const distSq = dx * dx + dz * dz;
            const minDist = CAR_RADIUS * 2;

            if (distSq < minDist * minDist && distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                const overlap = minDist - dist;
                const nx = dx / dist;
                const nz = dz / dist;

                // Push apart equally
                const pushDist = overlap * 0.5 * PUSH_STRENGTH;

                const aInvuln = invulnerable?.has(i) ?? false;
                const bInvuln = invulnerable?.has(j) ?? false;

                if (!aInvuln) {
                    a.px -= nx * pushDist;
                    a.pz -= nz * pushDist;
                    a.speed *= (1 - SPEED_LOSS);
                }
                if (!bInvuln) {
                    b.px += nx * pushDist;
                    b.pz += nz * pushDist;
                    b.speed *= (1 - SPEED_LOSS);
                }
            }
        }
    }
}
