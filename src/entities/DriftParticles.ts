import * as THREE from 'three';

/**
 * GPU-friendly drift smoke particles using a single Points object.
 * Dead particles are moved far off-screen so they're invisible.
 */

const MAX_PARTICLES = 80;
const PARTICLE_LIFE = 0.8;          // seconds (shorter = disappear faster)
const SPAWN_RATE = 25;              // particles/second while drifting
const RISE_SPEED = 3.0;             // upward velocity (faster rise = faster disappear)
const SPREAD = 0.6;

const DEAD_POS = -9999;             // far off-screen position for dead particles

interface Particle {
    alive: boolean;
    life: number;
    maxLife: number;
    vx: number;
    vy: number;
    vz: number;
}

export class DriftParticles {
    private geometry: THREE.BufferGeometry;
    private positions: Float32Array;
    private particles: Particle[];
    private points: THREE.Points;
    private material: THREE.PointsMaterial;
    private spawnAccum = 0;

    constructor(scene: THREE.Scene) {
        this.positions = new Float32Array(MAX_PARTICLES * 3);
        this.particles = [];

        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.particles.push({
                alive: false, life: 0, maxLife: PARTICLE_LIFE,
                vx: 0, vy: 0, vz: 0,
            });
            // Start dead particles off-screen
            this.positions[i * 3] = DEAD_POS;
            this.positions[i * 3 + 1] = DEAD_POS;
            this.positions[i * 3 + 2] = DEAD_POS;
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

        this.material = new THREE.PointsMaterial({
            color: 0xaaaaaa,
            size: 1.2,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        scene.add(this.points);
    }

    update(
        dt: number,
        isDrifting: boolean,
        carX: number, carY: number, carZ: number,
        heading: number,
        speed: number,
    ) {
        let aliveCount = 0;

        // Spawn new particles when drifting
        if (isDrifting && speed > 5) {
            this.spawnAccum += SPAWN_RATE * dt;
            while (this.spawnAccum >= 1) {
                this.spawnAccum -= 1;
                this.spawn(carX, carY, carZ, heading, speed);
            }
        }

        // Update existing particles
        for (let i = 0; i < MAX_PARTICLES; i++) {
            const p = this.particles[i];
            if (!p.alive) continue;

            p.life -= dt;
            if (p.life <= 0) {
                // Kill particle — move off-screen
                p.alive = false;
                const idx = i * 3;
                this.positions[idx] = DEAD_POS;
                this.positions[idx + 1] = DEAD_POS;
                this.positions[idx + 2] = DEAD_POS;
                continue;
            }

            aliveCount++;
            const idx = i * 3;

            this.positions[idx] += p.vx * dt;
            this.positions[idx + 1] += p.vy * dt;
            this.positions[idx + 2] += p.vz * dt;

            // Slow down horizontal
            p.vx *= 0.95;
            p.vz *= 0.95;
        }

        // Update buffer
        (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

        // Fade material based on how many particles are alive (visual hint)
        this.material.opacity = aliveCount > 0 ? 0.35 : 0;
    }

    private spawn(cx: number, cy: number, cz: number, heading: number, speed: number) {
        for (let i = 0; i < MAX_PARTICLES; i++) {
            const p = this.particles[i];
            if (p.alive) continue;

            p.alive = true;
            p.maxLife = PARTICLE_LIFE * (0.6 + Math.random() * 0.8);
            p.life = p.maxLife;

            // Spawn behind car (rear wheels)
            const rearOffset = -2.0;
            const sideOffset = (Math.random() > 0.5 ? 0.8 : -0.8);
            const sx = cx + Math.sin(heading) * rearOffset + Math.cos(heading) * sideOffset;
            const sz = cz + Math.cos(heading) * rearOffset - Math.sin(heading) * sideOffset;

            const idx = i * 3;
            this.positions[idx] = sx;
            this.positions[idx + 1] = cy + 0.3;
            this.positions[idx + 2] = sz;

            p.vx = (Math.random() - 0.5) * SPREAD - Math.sin(heading) * speed * 0.08;
            p.vy = RISE_SPEED * (0.8 + Math.random() * 0.4);
            p.vz = (Math.random() - 0.5) * SPREAD - Math.cos(heading) * speed * 0.08;

            return;
        }
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
    }
}
