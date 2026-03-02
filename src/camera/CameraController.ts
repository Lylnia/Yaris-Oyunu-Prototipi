import * as THREE from 'three';

/**
 * Chase camera that follows the player car with smooth lag.
 */
export class CameraController {
    private offset = new THREE.Vector3(0, 6, -14); // behind & above
    private lookOffset = new THREE.Vector3(0, 1.5, 8); // look ahead point
    private smoothPos = new THREE.Vector3();
    private smoothLook = new THREE.Vector3();
    private inited = false;

    constructor(private camera: THREE.PerspectiveCamera) { }

    update(target: THREE.Object3D, speed: number, dt: number) {
        // Dynamic offset based on speed — pull back at high speed
        const speedFactor = Math.min(1, speed / 50);
        const dynOffset = this.offset.clone();
        dynOffset.z -= speedFactor * 4;   // pull further back
        dynOffset.y += speedFactor * 1.5; // raise slightly

        // Transform offset by target rotation
        const worldOffset = dynOffset.clone().applyQuaternion(target.quaternion).add(target.position);
        const worldLook = this.lookOffset.clone().applyQuaternion(target.quaternion).add(target.position);

        if (!this.inited) {
            this.smoothPos.copy(worldOffset);
            this.smoothLook.copy(worldLook);
            this.inited = true;
        }

        // Smooth follow (lower = more lag)
        const posDamp = 5 * dt;
        const lookDamp = 8 * dt;
        this.smoothPos.lerp(worldOffset, Math.min(1, posDamp));
        this.smoothLook.lerp(worldLook, Math.min(1, lookDamp));

        this.camera.position.copy(this.smoothPos);
        this.camera.lookAt(this.smoothLook);
    }
}
