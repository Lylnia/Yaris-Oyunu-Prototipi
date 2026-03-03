import * as THREE from 'three';

/**
 * GPU-friendly drift smoke particles using a single Points object.
 * Object-pooled: reuses a fixed buffer of particles.
 */

const MAX_PARTICLES = 80;
const PARTICLE_LIFE = 1.2;         // seconds
const SPAWN_RATE = 30;              // particles/second while drifting
const RISE_SPEED = 2.5;             // upward velocity
const SPREAD = 0.8;                 // random horizontal spread

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
    private alphas: Float32Array;
    private sizes: Float32Array;
    private particles: Particle[];
    private points: THREE.Points;
    private spawnAccum = 0;

    constructor(scene: THREE.Scene) {
        this.positions = new Float32Array(MAX_PARTICLES * 3);
        this.alphas = new Float32Array(MAX_PARTICLES);
        this.sizes = new Float32Array(MAX_PARTICLES);
        this.particles = [];

        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.particles.push({
                alive: false, life: 0, maxLife: PARTICLE_LIFE,
                vx: 0, vy: 0, vz: 0,
            });
            this.alphas[i] = 0;
            this.sizes[i] = 0;
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

        const material = new THREE.PointsMaterial({
            color: 0xcccccc,
            size: 1.5,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            sizeAttenuation: true,
            blending: THREE.NormalBlending,
        });

        this.points = new THREE.Points(this.geometry, material);
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
                p.alive = false;
                this.alphas[i] = 0;
                this.sizes[i] = 0;
                continue;
            }

            const t = 1 - p.life / p.maxLife; // 0→1 over lifetime
            const idx = i * 3;

            this.positions[idx] += p.vx * dt;
            this.positions[idx + 1] += p.vy * dt;
            this.positions[idx + 2] += p.vz * dt;

            // Fade out and grow
            this.alphas[i] = (1 - t) * 0.6;
            this.sizes[i] = 1.0 + t * 3.0;

            // Slow down horizontal
            p.vx *= 0.97;
            p.vz *= 0.97;
        }

        // Update buffers
        (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (this.geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
        (this.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;

        // Update material opacity based on average
        const mat = this.points.material as THREE.PointsMaterial;
        mat.opacity = 0.5;
    }

    private spawn(cx: number, cy: number, cz: number, heading: number, speed: number) {
        // Find dead particle
        for (let i = 0; i < MAX_PARTICLES; i++) {
            const p = this.particles[i];
            if (p.alive) continue;

            p.alive = true;
            p.maxLife = PARTICLE_LIFE * (0.7 + Math.random() * 0.6);
            p.life = p.maxLife;

            // Spawn behind car (rear wheels, offset left/right)
            const rearOffset = -2.0;
            const sideOffset = (Math.random() > 0.5 ? 0.8 : -0.8);
            const sx = cx + Math.sin(heading) * rearOffset + Math.cos(heading) * sideOffset;
            const sz = cz + Math.cos(heading) * rearOffset - Math.sin(heading) * sideOffset;

            const idx = i * 3;
            this.positions[idx] = sx;
            this.positions[idx + 1] = cy + 0.3;
            this.positions[idx + 2] = sz;

            // Velocity: slight backward + upward + random spread
            p.vx = (Math.random() - 0.5) * SPREAD - Math.sin(heading) * speed * 0.1;
            p.vy = RISE_SPEED * (0.8 + Math.random() * 0.4);
            p.vz = (Math.random() - 0.5) * SPREAD - Math.cos(heading) * speed * 0.1;

            return;
        }
    }

    dispose() {
        this.geometry.dispose();
        (this.points.material as THREE.Material).dispose();
    }
}
