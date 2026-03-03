import { Car } from '../entities/Car';

/**
 * Simple sphere-based collision between all cars.
 * Uses intentionally large hitboxes for satisfying bumper-to-bumper physics.
 */

const HITBOX_RADIUS = 3.5;          // ~1.5× car length — deliberately oversized
const PUSH_FORCE = 0.92;            // how much to push apart on overlap
const SPEED_LOSS = 0.7;             // speed multiplier on collision
const BOUNCE_FACTOR = 0.35;         // how much directional bounce to apply

export function resolveCarCollisions(cars: Car[]): void {
    for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
            const a = cars[i].state;
            const b = cars[j].state;

            const dx = a.px - b.px;
            const dz = a.pz - b.pz;
            const distSq = dx * dx + dz * dz;
            const minDist = HITBOX_RADIUS * 2;

            if (distSq < minDist * minDist && distSq > 0.001) {
                const dist = Math.sqrt(distSq);
                const overlap = minDist - dist;

                // Normalised separation vector
                const nx = dx / dist;
                const nz = dz / dist;

                // Push cars apart (half each)
                const pushHalf = overlap * PUSH_FORCE * 0.5;
                a.px += nx * pushHalf;
                a.pz += nz * pushHalf;
                b.px -= nx * pushHalf;
                b.pz -= nz * pushHalf;

                // Speed reduction
                const aSpd = Math.abs(a.speed);
                const bSpd = Math.abs(b.speed);

                // Transfer some momentum — faster car pushes slower car
                const relSpeed = aSpd - bSpd;
                a.speed *= SPEED_LOSS;
                b.speed *= SPEED_LOSS;

                // Directional bounce: deflect heading slightly
                if (aSpd > 1) {
                    a.heading += nx * BOUNCE_FACTOR * Math.sign(relSpeed + 0.1) * 0.15;
                    a.travelDir += nx * BOUNCE_FACTOR * Math.sign(relSpeed + 0.1) * 0.1;
                }
                if (bSpd > 1) {
                    b.heading -= nx * BOUNCE_FACTOR * Math.sign(-relSpeed + 0.1) * 0.15;
                    b.travelDir -= nx * BOUNCE_FACTOR * Math.sign(-relSpeed + 0.1) * 0.1;
                }
            }
        }
    }
}
