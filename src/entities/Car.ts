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

    constructor(id: number, color: number, x: number, z: number, heading: number, isPlayer = false) {
        this.id = id;
        this.isPlayer = isPlayer;
        this.state = createCarState(x, z, heading);
        this.mesh = createCarModel(color);
        this.mesh.position.set(x, 0, z);
        this.mesh.rotation.y = heading;
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
}
