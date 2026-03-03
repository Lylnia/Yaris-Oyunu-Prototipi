import { Car } from '../entities/Car';

/**
 * Car-to-car collision with separate handling for player-AI vs AI-AI.
 * AI-AI collisions are much softer to prevent bunching/sticking at start.
 */

const PLAYER_HITBOX = 1.2;          // player collision radius
const AI_HITBOX = 1.0;              // AI vs AI — tighter, less sticky
const PUSH_FORCE = 0.92;
const SPEED_LOSS_PLAYER = 0.75;     // player collisions: noticeable impact
const SPEED_LOSS_AI = 0.95;         // AI-AI: minimal speed loss (prevents sticking)
const BOUNCE_FACTOR = 0.3;

export function resolveCarCollisions(cars: Car[]): void {
    for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
            const carA = cars[i];
            const carB = cars[j];
            const a = carA.state;
            const b = carB.state;

            const dx = a.px - b.px;
            const dz = a.pz - b.pz;
            const distSq = dx * dx + dz * dz;

            // Use different hitbox sizes depending on whether player is involved
            const playerInvolved = carA.isPlayer || carB.isPlayer;
            const radius = playerInvolved ? PLAYER_HITBOX : AI_HITBOX;
            const minDist = radius * 2;

            if (distSq < minDist * minDist && distSq > 0.001) {
                const dist = Math.sqrt(distSq);
                const overlap = minDist - dist;

                // Normalised separation vector
                const nx = dx / dist;
                const nz = dz / dist;

                // Push cars apart
                const pushHalf = overlap * PUSH_FORCE * 0.5;
                a.px += nx * pushHalf;
                a.pz += nz * pushHalf;
                b.px -= nx * pushHalf;
                b.pz -= nz * pushHalf;

                // Speed reduction — much less for AI-AI to prevent cascade stalls
                const speedLoss = playerInvolved ? SPEED_LOSS_PLAYER : SPEED_LOSS_AI;
                const aSpd = Math.abs(a.speed);
                const bSpd = Math.abs(b.speed);
                const relSpeed = aSpd - bSpd;

                a.speed *= speedLoss;
                b.speed *= speedLoss;

                // Directional bounce — only for player collisions
                if (playerInvolved) {
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
}
