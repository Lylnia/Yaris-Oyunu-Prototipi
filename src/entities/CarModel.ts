import * as THREE from 'three';

/**
 * Creates a low-poly sports car mesh.
 * Body colour is customisable; all geometry is procedural.
 */
export function createCarModel(color: number = 0x00ffff): THREE.Group {
    const car = new THREE.Group();

    // ── Main body ──
    // Using a more rounded/detailed approach with primitives
    const bodyMat = new THREE.MeshStandardMaterial({
        color, metalness: 0.8, roughness: 0.2, envMapIntensity: 1.0
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.5, roughness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x111115, transparent: true, opacity: 0.8, metalness: 0.9, roughness: 0.1
    });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.0 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.0 });

    // Lower, sleeker body
    const bodyGeo = new THREE.BoxGeometry(1.8, 0.4, 4.2);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.35;
    car.add(body);

    // Front bumper (rounded)
    const bumperGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.4, 16, 1, false, Math.PI / 2, Math.PI);
    const bumper = new THREE.Mesh(bumperGeo, bodyMat);
    bumper.rotation.z = Math.PI / 2;
    bumper.position.set(0, 0.35, 2.1);
    car.add(bumper);

    // Rear bumper (rounded)
    const rBumperGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.4, 16, 1, false, -Math.PI / 2, Math.PI);
    const rBumper = new THREE.Mesh(rBumperGeo, bodyMat);
    rBumper.rotation.z = Math.PI / 2;
    rBumper.position.set(0, 0.35, -2.1);
    car.add(rBumper);

    // ── Cabin (more aerodynamic) ──
    const cabinGeo = new THREE.BoxGeometry(1.4, 0.4, 1.8);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 0.75, -0.2);
    car.add(cabin);

    // Windshield slope
    const windshieldGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.4, 3, 1, false, 0, Math.PI);
    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.rotation.z = Math.PI / 2;
    windshield.rotation.x = -Math.PI / 4;
    windshield.position.set(0, 0.65, 0.8);
    windshield.scale.set(1, 0.5, 1);
    car.add(windshield);

    // Rear window slope
    const rearWindowGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.4, 3, 1, false, 0, Math.PI);
    const rearWindow = new THREE.Mesh(rearWindowGeo, glassMat);
    rearWindow.rotation.z = Math.PI / 2;
    rearWindow.rotation.x = Math.PI / 4 + Math.PI;
    rearWindow.position.set(0, 0.65, -1.2);
    rearWindow.scale.set(1, 0.5, 1);
    car.add(rearWindow);

    // Roof (smooth)
    const roofGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.4, 16, 1, false, 0, Math.PI);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.rotation.z = Math.PI / 2;
    roof.position.set(0, 0.95, -0.2);
    roof.scale.set(1, 0.1, 1);
    car.add(roof);

    // ── Rear spoiler ──
    const spoilerGeo = new THREE.BoxGeometry(1.7, 0.05, 0.4);
    const spoiler = new THREE.Mesh(spoilerGeo, darkMat);
    spoiler.position.set(0, 0.85, -2.0);
    spoiler.rotation.x = -0.05;
    car.add(spoiler);

    const spoilerLegs = new THREE.BoxGeometry(0.1, 0.3, 0.1);
    [-0.6, 0.6].forEach(x => {
        const leg = new THREE.Mesh(spoilerLegs, darkMat);
        leg.position.set(x, 0.7, -1.9);
        leg.rotation.x = -0.2;
        car.add(leg);
    });

    // ── Headlights ──
    [[-0.6, 0.45, 2.3], [0.6, 0.45, 2.3]].forEach(([x, y, z]) => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), lightMat);
        hl.position.set(x, y, z);
        hl.rotation.x = -0.2;
        car.add(hl);
    });

    // ── Tail lights ──
    [[-0.6, 0.45, -2.3], [0.6, 0.45, -2.3]].forEach(([x, y, z], i) => {
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), tailMat.clone());
        tl.position.set(x, y, z);
        tl.rotation.x = 0.2;
        tl.name = `tailLight${i}`;
        car.add(tl);
    });

    // ── Tail light glow ──
    const tailGlowMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.15, 0.1),
        tailMat.clone(),
    );
    tailGlowMesh.position.set(0, 0.45, -2.28);
    tailGlowMesh.name = 'tailGlow';
    car.add(tailGlowMesh);

    // ── Wheels (More detailed, thicker) ──
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
    const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 8);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.1 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9, roughness: 0.2 });

    const wheelPositions = [
        [-0.9, 0.15, 1.3], [0.9, 0.15, 1.3],   // front
        [-0.9, 0.15, -1.4], [0.9, 0.15, -1.4],  // rear
    ];

    wheelPositions.forEach(([x, y, z]) => {
        const wheelGroup = new THREE.Group();

        const tire = new THREE.Mesh(wheelGeo, wheelMat);
        tire.rotation.z = Math.PI / 2;

        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.z = Math.PI / 2;

        wheelGroup.add(tire);
        wheelGroup.add(rim);
        wheelGroup.position.set(x, y, z);
        car.add(wheelGroup);
    });

    // ── Underbody ──
    const underGeo = new THREE.BoxGeometry(1.7, 0.1, 4.0);
    const under = new THREE.Mesh(underGeo, darkMat);
    under.position.y = 0.15;
    car.add(under);

    car.traverse((c: THREE.Object3D) => { if (c instanceof THREE.Mesh) c.castShadow = true; });

    return car;
}
