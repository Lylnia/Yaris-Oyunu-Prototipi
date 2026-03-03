import * as THREE from 'three';
import { CarState, createCarState, updateCarPhysics } from '../physics/CarPhysics';
import { createCarModel } from './CarModel';
import type { InputState } from '../InputManager';
import { lerpAngle } from '../utils/MathUtils';

export class Car {
    state: CarState;
    mesh: THREE.Group;
    readonly isPlayer: boolean;
    readonly id: number;
    /** Track-progress t value [0-1] */
    trackT = 0;
    /** Current lap (1-based) */
    lap = 1;
    /** Checkpoints passed bitfield */
    checkpoints = 0;
    /** Array of lap times in seconds */
    lapTimes: number[] = [];
    /** Timer for current lap */
    currentLapTime = 0;
    /** Best lap time */
    bestLap = Infinity;

    private bodyTiltX = 0; // pitch (accel/brake)
    private bodyTiltZ = 0; // roll (steering)

    // Dynamic brake light references
    private tailLights: THREE.Mesh[] = [];
    private tailGlow: THREE.PointLight | null = null;

    // Initial position for reset
    private readonly initX: number;
    private readonly initZ: number;
    private readonly initHeading: number;

    constructor(id: number, color: number, x: number, z: number, heading: number, isPlayer = false) {
        this.id = id;
        this.isPlayer = isPlayer;
        this.initX = x;
        this.initZ = z;
        this.initHeading = heading;
        this.state = createCarState(x, z, heading);
        this.mesh = createCarModel(color);
        this.mesh.position.set(x, 0, z);
        this.mesh.rotation.y = heading;

        // Cache brake light references
        this.mesh.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh && child.name.startsWith('tailLight')) {
                this.tailLights.push(child);
            }
            if (child instanceof THREE.PointLight && child.name === 'tailGlow') {
                this.tailGlow = child;
            }
        });
    }

    update(input: InputState, dt: number, surfaceGrip: number = 1) {
        updateCarPhysics(this.state, input, dt, surfaceGrip);

        // Update timing
        this.currentLapTime += dt;

        // ── Visual: sync mesh to physics ──
        this.mesh.position.set(this.state.px, this.state.py, this.state.pz);
        this.mesh.rotation.y = this.state.heading;

        // Body tilt for feel
        const targetPitch = -input.throttle * 0.03 + input.brake * 0.05;
        const targetRoll = -input.steer * 0.04 * Math.min(1, this.state.speed / 15);
        this.bodyTiltX = lerpAngle(this.bodyTiltX, targetPitch, 4 * dt);
        this.bodyTiltZ = lerpAngle(this.bodyTiltZ, targetRoll, 4 * dt);
        this.mesh.rotation.x = this.bodyTiltX;
        this.mesh.rotation.z = this.bodyTiltZ;

        // ── Dynamic brake lights ──
        const braking = input.brake > 0.1 && this.state.speed > 0.5;
        const brakeIntensity = braking ? 0.5 + input.brake * 2.5 : 1.0;
        const brakeEmissive = braking ? 3.0 : 1.0;

        for (const tl of this.tailLights) {
            const mat = tl.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = brakeEmissive;
        }
        if (this.tailGlow) {
            this.tailGlow.intensity = brakeIntensity;
        }
    }

    /** Called when crossing start/finish */
    completeLap() {
        this.lapTimes.push(this.currentLapTime);
        if (this.currentLapTime < this.bestLap) this.bestLap = this.currentLapTime;
        this.currentLapTime = 0;
        this.lap++;
        this.checkpoints = 0;
    }

    getSpeedKmh(): number {
        return this.state.speed * 3.6;
    }

    /** Reset car to initial state for soft restart */
    reset(x?: number, z?: number, heading?: number) {
        this.state = createCarState(x ?? this.initX, z ?? this.initZ, heading ?? this.initHeading);
        this.mesh.position.set(this.state.px, 0, this.state.pz);
        this.mesh.rotation.set(0, this.state.heading, 0);
        this.trackT = 0;
        this.lap = 1;
        this.checkpoints = 0;
        this.lapTimes = [];
        this.currentLapTime = 0;
        this.bestLap = Infinity;
        this.bodyTiltX = 0;
        this.bodyTiltZ = 0;
    }
}
