import * as THREE from 'three';

export enum CameraMode {
    Chase = 'Chase',
    Hood = 'Hood',
    Bumper = 'Bumper',
}

interface CameraPreset {
    offset: THREE.Vector3;
    lookOffset: THREE.Vector3;
    fov: number;
    posDamp: number;
    lookDamp: number;
    speedPullBack: number;
    speedRaise: number;
}

const PRESETS: Record<CameraMode, CameraPreset> = {
    [CameraMode.Chase]: {
        offset: new THREE.Vector3(0, 6, -14),
        lookOffset: new THREE.Vector3(0, 1.5, 8),
        fov: 65,
        posDamp: 5,
        lookDamp: 8,
        speedPullBack: 4,
        speedRaise: 1.5,
    },
    [CameraMode.Hood]: {
        offset: new THREE.Vector3(0, 1.6, 0.8),
        lookOffset: new THREE.Vector3(0, 1.4, 10),
        fov: 75,
        posDamp: 15,
        lookDamp: 20,
        speedPullBack: 0,
        speedRaise: 0,
    },
    [CameraMode.Bumper]: {
        offset: new THREE.Vector3(0, 0.7, 2.5),
        lookOffset: new THREE.Vector3(0, 0.8, 15),
        fov: 80,
        posDamp: 20,
        lookDamp: 25,
        speedPullBack: 0,
        speedRaise: 0,
    },
};

const MODE_ORDER: CameraMode[] = [CameraMode.Chase, CameraMode.Hood, CameraMode.Bumper];

/**
 * Chase camera that follows the player car with smooth lag.
 * Supports multiple camera modes toggled with C key.
 */
export class CameraController {
    private smoothPos = new THREE.Vector3();
    private smoothLook = new THREE.Vector3();
    private inited = false;
    private modeIndex = 0;
    mode: CameraMode = CameraMode.Chase;

    /** Called when camera mode changes */
    onModeChange: ((mode: CameraMode) => void) | null = null;

    constructor(private camera: THREE.PerspectiveCamera) {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyC') {
                this.nextMode();
            }
        });
    }

    nextMode() {
        this.modeIndex = (this.modeIndex + 1) % MODE_ORDER.length;
        this.mode = MODE_ORDER[this.modeIndex];
        const preset = PRESETS[this.mode];
        this.camera.fov = preset.fov;
        this.camera.updateProjectionMatrix();
        if (this.onModeChange) {
            this.onModeChange(this.mode);
        }
    }

    update(target: THREE.Object3D, speed: number, dt: number) {
        const preset = PRESETS[this.mode];

        // Dynamic offset based on speed — pull back at high speed
        const speedFactor = Math.min(1, speed / 50);
        const dynOffset = preset.offset.clone();
        dynOffset.z -= speedFactor * preset.speedPullBack;
        dynOffset.y += speedFactor * preset.speedRaise;

        // Transform offset by target rotation
        const worldOffset = dynOffset.clone().applyQuaternion(target.quaternion).add(target.position);
        const worldLook = preset.lookOffset.clone().applyQuaternion(target.quaternion).add(target.position);

        if (!this.inited) {
            this.smoothPos.copy(worldOffset);
            this.smoothLook.copy(worldLook);
            this.inited = true;
        }

        // Smooth follow
        const posDamp = preset.posDamp * dt;
        const lookDamp = preset.lookDamp * dt;
        this.smoothPos.lerp(worldOffset, Math.min(1, posDamp));
        this.smoothLook.lerp(worldLook, Math.min(1, lookDamp));

        this.camera.position.copy(this.smoothPos);
        this.camera.lookAt(this.smoothLook);
    }

    /** Reset camera for soft restart */
    reset() {
        this.inited = false;
    }
}
