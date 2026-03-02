import * as THREE from 'three';

/**
 * Creates a low-poly sports car mesh.
 * Body colour is customisable; all geometry is procedural.
 */
export function createCarModel(color: number = 0x00ffff): THREE.Group {
    const car = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
        color, flatShading: true, metalness: 0.6, roughness: 0.3,
        emissive: color, emissiveIntensity: 0.15,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true, emissive: 0x111111, emissiveIntensity: 0.1 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, flatShading: true, transparent: true, opacity: 0.6, metalness: 0.9, roughness: 0.1, emissive: 0x446688, emissiveIntensity: 0.3 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.0 });

    // ── Main body ──
    const bodyGeo = new THREE.BoxGeometry(1.8, 0.5, 4.2);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    car.add(body);

    // ── Cabin ──
    const cabinGeo = new THREE.BoxGeometry(1.5, 0.45, 1.6);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 0.85, -0.3);
    car.add(cabin);

    // ── Hood slope (wedge shape) ──
    const hoodGeo = new THREE.BoxGeometry(1.7, 0.25, 1.2);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.55, 1.3);
    hood.rotation.x = -0.15;
    car.add(hood);

    // ── Rear spoiler ──
    const spoilerGeo = new THREE.BoxGeometry(1.6, 0.06, 0.3);
    const spoiler = new THREE.Mesh(spoilerGeo, darkMat);
    spoiler.position.set(0, 1.0, -1.9);
    car.add(spoiler);
    const spoilerLegs = new THREE.BoxGeometry(0.08, 0.25, 0.08);
    [-0.6, 0.6].forEach(x => {
        const leg = new THREE.Mesh(spoilerLegs, darkMat);
        leg.position.set(x, 0.85, -1.9);
        car.add(leg);
    });

    // ── Headlights ──
    [[-0.6, 0.45, 2.12], [0.6, 0.45, 2.12]].forEach(([x, y, z]) => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), lightMat);
        hl.position.set(x, y, z);
        car.add(hl);
    });

    // ── Headlight point light (illuminates road ahead) ──
    const headlightBeam = new THREE.PointLight(0xffffff, 1.5, 25);
    headlightBeam.position.set(0, 0.5, 2.5);
    car.add(headlightBeam);

    // ── Tail lights ──
    [[-0.6, 0.45, -2.12], [0.6, 0.45, -2.12]].forEach(([x, y, z]) => {
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), tailMat);
        tl.position.set(x, y, z);
        car.add(tl);
    });

    // ── Tail light glow ──
    const tailGlow = new THREE.PointLight(0xff0000, 0.8, 10);
    tailGlow.position.set(0, 0.45, -2.3);
    car.add(tailGlow);

    // ── Neon side strips ──
    const stripMat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 1.0,
    });
    [-0.92, 0.92].forEach(x => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 3.5), stripMat);
        strip.position.set(x, 0.18, 0);
        car.add(strip);
    });

    // ── Wheels ──
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333, flatShading: true, emissive: 0x111111, emissiveIntensity: 0.1 });
    const wheelPositions = [
        [-0.9, 0.15, 1.3], [0.9, 0.15, 1.3],   // front
        [-0.9, 0.15, -1.3], [0.9, 0.15, -1.3],  // rear
    ];
    wheelPositions.forEach(([x, y, z]) => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, y, z);
        car.add(wheel);
    });

    // ── Underbody ──
    const underGeo = new THREE.BoxGeometry(1.7, 0.08, 4.0);
    const under = new THREE.Mesh(underGeo, darkMat);
    under.position.y = 0.12;
    car.add(under);

    car.traverse((c: THREE.Object3D) => { if (c instanceof THREE.Mesh) c.castShadow = true; });

    return car;
}
