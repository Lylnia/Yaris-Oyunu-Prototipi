import * as THREE from 'three';
import { TRACK_CONTROL_POINTS, TRACK_WIDTH, TRACK_SEGMENTS } from './TrackData';

/**
 * Builds and manages the oval track mesh, environment, barriers, and spatial queries.
 * Optimised: fewer lights, simpler geometry.
 */
export class Track {
    readonly curve: THREE.CatmullRomCurve3;
    readonly group = new THREE.Group();
    private points: THREE.Vector3[] = [];
    private tangents: THREE.Vector3[] = [];

    constructor(scene: THREE.Scene) {
        this.curve = new THREE.CatmullRomCurve3(TRACK_CONTROL_POINTS, true, 'catmullrom', 0.5);
        this.samplePoints();
        this.buildRoadMesh();
        this.buildEdgeLines();
        this.buildBarrierWalls();
        this.buildEnvironment();
        scene.add(this.group);
    }

    /* ── Spatial queries ── */

    getClosestT(px: number, pz: number): number {
        let best = 0, bestDist = Infinity;
        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best / this.points.length;
    }

    isOnRoad(px: number, pz: number): boolean {
        let minDist = Infinity;
        for (let i = 0; i < this.points.length; i += 4) {
            const p = this.points[i];
            const d = Math.sqrt((p.x - px) ** 2 + (p.z - pz) ** 2);
            if (d < minDist) minDist = d;
        }
        return minDist < TRACK_WIDTH * 0.55;
    }

    getElevation(px: number, pz: number): number {
        let best = 0, bestDist = Infinity;
        for (let i = 0; i < this.points.length; i += 2) {
            const p = this.points[i];
            const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return this.points[best].y;
    }

    getPointAt(t: number): { pos: THREE.Vector3; tangent: THREE.Vector3 } {
        return {
            pos: this.curve.getPointAt(t),
            tangent: this.curve.getTangentAt(t).normalize(),
        };
    }

    isInTunnel(): boolean { return false; }

    /**
     * Constrains a car to track bounds — acts as barrier collision.
     * Mutates the state object in place. Returns true if wall was hit.
     */
    constrainToTrack(state: { px: number; pz: number; speed: number }): boolean {
        let bestIdx = 0, bestDist = Infinity;
        for (let i = 0; i < this.points.length; i += 2) {
            const p = this.points[i];
            const d = (p.x - state.px) ** 2 + (p.z - state.pz) ** 2;
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }

        const closest = this.points[bestIdx];
        const tang = this.tangents[bestIdx];
        const perpX = tang.z;
        const perpZ = -tang.x;

        const dx = state.px - closest.x;
        const dz = state.pz - closest.z;
        const lateral = dx * perpX + dz * perpZ;

        const maxLateral = TRACK_WIDTH / 2;

        if (Math.abs(lateral) > maxLateral) {
            const sign = Math.sign(lateral);
            state.px = closest.x + perpX * maxLateral * 0.92 * sign;
            state.pz = closest.z + perpZ * maxLateral * 0.92 * sign;
            state.speed *= 0.5;
            return true;
        }
        return false;
    }

    /* ── Build geometry ── */

    private samplePoints() {
        for (let i = 0; i <= TRACK_SEGMENTS; i++) {
            const t = i / TRACK_SEGMENTS;
            this.points.push(this.curve.getPointAt(t));
            this.tangents.push(this.curve.getTangentAt(t).normalize());
        }
    }

    private buildRoadMesh() {
        const verts: number[] = [];
        const indices: number[] = [];
        const halfW = TRACK_WIDTH / 2;

        for (let i = 0; i <= TRACK_SEGMENTS; i++) {
            const p = this.points[i];
            const t = this.tangents[i];
            const rx = t.z, rz = -t.x;
            verts.push(p.x - rx * halfW, p.y + 0.01, p.z - rz * halfW);
            verts.push(p.x + rx * halfW, p.y + 0.01, p.z + rz * halfW);
        }

        for (let i = 0; i < TRACK_SEGMENTS; i++) {
            const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
            indices.push(a, c, b, b, c, d);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            color: 0x555568, flatShading: true, roughness: 0.75, metalness: 0.05,
            emissive: 0x111118, emissiveIntensity: 0.3,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        this.group.add(mesh);
    }

    private buildEdgeLines() {
        const halfW = TRACK_WIDTH / 2;
        for (const side of [-1, 1]) {
            const pts: THREE.Vector3[] = [];
            for (let i = 0; i <= TRACK_SEGMENTS; i += 3) {
                const p = this.points[i];
                const t = this.tangents[i];
                const rx = t.z * side, rz = -t.x * side;
                pts.push(new THREE.Vector3(p.x + rx * halfW, p.y + 0.04, p.z + rz * halfW));
            }
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
            this.group.add(new THREE.Line(geo, mat));
        }
        // Center dashed line
        const cPts: THREE.Vector3[] = [];
        for (let i = 0; i <= TRACK_SEGMENTS; i += 4) {
            const p = this.points[i];
            cPts.push(new THREE.Vector3(p.x, p.y + 0.04, p.z));
        }
        const cGeo = new THREE.BufferGeometry().setFromPoints(cPts);
        const cMat = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3 });
        this.group.add(new THREE.Line(cGeo, cMat));
    }

    private buildBarrierWalls() {
        const halfW = TRACK_WIDTH / 2 + 0.3;
        const wallHeight = 1.2;

        const barrierMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc, emissive: 0x333333, emissiveIntensity: 0.3, flatShading: true,
        });
        const topStripeMat = new THREE.MeshStandardMaterial({
            color: 0xff2288, emissive: 0xff0066, emissiveIntensity: 0.8, flatShading: true,
        });

        for (const side of [-1, 1]) {
            // Continuous wall segments
            for (let i = 0; i < TRACK_SEGMENTS; i += 6) {
                const p = this.points[i];
                const t = this.tangents[i];
                const rx = t.z * side, rz = -t.x * side;
                const wx = p.x + rx * halfW;
                const wz = p.z + rz * halfW;

                // Wall block
                const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, wallHeight, 4), barrierMat);
                wall.position.set(wx, p.y + wallHeight / 2, wz);
                wall.rotation.y = Math.atan2(t.x, t.z);
                this.group.add(wall);

                // Neon top stripe every 3rd segment
                if (i % 18 === 0) {
                    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 4), topStripeMat);
                    stripe.position.set(wx, p.y + wallHeight + 0.08, wz);
                    stripe.rotation.y = Math.atan2(t.x, t.z);
                    this.group.add(stripe);
                }
            }
        }
    }

    private buildEnvironment() {
        this.buildGround();
        this.buildGrandstands();
        this.buildNeonSigns();
        this.buildLights();
    }

    private buildGround() {
        const geo = new THREE.PlaneGeometry(1000, 1000);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x22223a, flatShading: true,
            emissive: 0x0a0a18, emissiveIntensity: 0.2,
        });
        const ground = new THREE.Mesh(geo, mat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        this.group.add(ground);
    }

    private buildGrandstands() {
        const rng = this.seededRNG(42);

        // Outside the oval on both straights
        const standPositions = [
            // Right straight grandstands
            { x: 190, z: -100, w: 20, h: 25, d: 80 },
            { x: 195, z: 100, w: 20, h: 30, d: 80 },
            // Left straight grandstands
            { x: -190, z: -100, w: 20, h: 25, d: 80 },
            { x: -195, z: 100, w: 20, h: 30, d: 80 },
        ];

        const standMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a35, flatShading: true,
        });

        standPositions.forEach(s => {
            const geo = new THREE.BoxGeometry(s.w, s.h, s.d);
            const stand = new THREE.Mesh(geo, standMat);
            stand.position.set(s.x, s.h / 2, s.z);
            stand.castShadow = true;
            this.group.add(stand);

            // Neon edge on top
            const neonColors = [0x00ffff, 0xff0080, 0x8000ff, 0x00ff80];
            const nc = neonColors[Math.floor(rng() * 4)];
            const edgeMat = new THREE.MeshStandardMaterial({
                color: nc, emissive: nc, emissiveIntensity: 1.0,
            });
            const edge = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.5, 0.4, s.d + 0.5), edgeMat);
            edge.position.set(s.x, s.h, s.z);
            this.group.add(edge);
        });

        // Scattered buildings around the oval
        for (let i = 0; i < 40; i++) {
            const angle = rng() * Math.PI * 2;
            const dist = 220 + rng() * 200;
            const cx = Math.cos(angle) * dist;
            const cz = Math.sin(angle) * dist;
            if (this.isOnRoad(cx, cz)) continue;

            const w = 8 + rng() * 20;
            const h = 15 + rng() * 50;
            const d = 8 + rng() * 20;
            const colors = [0x0a0a1a, 0x12122a, 0x0f0f25, 0x1a1a35];
            const mat = new THREE.MeshStandardMaterial({
                color: colors[Math.floor(rng() * colors.length)], flatShading: true,
            });
            const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            bld.position.set(cx, h / 2, cz);
            this.group.add(bld);

            if (rng() > 0.5) {
                const nc = [0x00ffff, 0xff0080, 0x8000ff][Math.floor(rng() * 3)];
                const edgeMat = new THREE.MeshStandardMaterial({
                    color: nc, emissive: nc, emissiveIntensity: 0.8,
                });
                const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), edgeMat);
                edge.position.set(cx, h, cz);
                this.group.add(edge);
            }
        }
    }

    private buildNeonSigns() {
        const colors = [0x00ffff, 0xff0080, 0xffff00, 0x00ff80, 0x8000ff];
        const rng = this.seededRNG(99);

        for (let i = 0; i < 20; i++) {
            const t = rng();
            const { pos, tangent } = this.getPointAt(t);
            const side = rng() > 0.5 ? 1 : -1;
            const offset = TRACK_WIDTH * 0.6 + 5 + rng() * 10;
            const sx = pos.x + tangent.z * side * offset;
            const sz = pos.z - tangent.x * side * offset;
            const color = colors[Math.floor(rng() * colors.length)];

            const mat = new THREE.MeshStandardMaterial({
                color, emissive: color, emissiveIntensity: 1.0,
            });
            const sign = new THREE.Mesh(new THREE.BoxGeometry(3 + rng() * 5, 1.5 + rng() * 2, 0.2), mat);
            sign.position.set(sx, 4 + rng() * 5, sz);
            sign.rotation.y = Math.atan2(tangent.x, tangent.z);
            this.group.add(sign);
        }
    }

    private buildLights() {
        // Trackside lights — every ~80m, alternating sides
        for (let i = 0; i < 25; i++) {
            const t = i / 25;
            const { pos, tangent } = this.getPointAt(t);
            const side = i % 2 === 0 ? 1 : -1;
            const lx = pos.x + tangent.z * side * (TRACK_WIDTH / 2 + 3);
            const lz = pos.z - tangent.x * side * (TRACK_WIDTH / 2 + 3);

            const light = new THREE.PointLight(0xffaa66, 2.5, 70);
            light.position.set(lx, 8, lz);
            this.group.add(light);

            // Post
            const postMat = new THREE.MeshStandardMaterial({ color: 0x666666, flatShading: true });
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 8, 6), postMat);
            post.position.set(lx, 4, lz);
            this.group.add(post);

            // Glowing head
            const headMat = new THREE.MeshStandardMaterial({
                color: 0xffcc88, emissive: 0xffaa44, emissiveIntensity: 1.5,
            });
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.6), headMat);
            head.position.set(lx, 8, lz);
            this.group.add(head);
        }
    }

    private seededRNG(seed: number) {
        let s = seed;
        return () => {
            s = (s * 16807 + 0) % 2147483647;
            return s / 2147483647;
        };
    }
}
