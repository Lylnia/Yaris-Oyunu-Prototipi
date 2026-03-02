import * as THREE from 'three';
import { TRACK_CONTROL_POINTS, TRACK_WIDTH, TRACK_SEGMENTS, TUNNEL_T_RANGE } from './TrackData';

/**
 * Builds and manages the track mesh, environment, and spatial queries.
 */
export class Track {
    readonly curve: THREE.CatmullRomCurve3;
    readonly group = new THREE.Group();
    private points: THREE.Vector3[] = [];// sampled
    private tangents: THREE.Vector3[] = [];

    constructor(scene: THREE.Scene) {
        this.curve = new THREE.CatmullRomCurve3(TRACK_CONTROL_POINTS, true, 'catmullrom', 0.5);
        this.samplePoints();
        this.buildRoadMesh();
        this.buildBarriers();
        this.buildEnvironment();
        scene.add(this.group);
    }

    /* ── Spatial queries ── */

    /** Get closest t on curve for a world position */
    getClosestT(px: number, pz: number): number {
        let best = 0, bestDist = Infinity;
        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best / this.points.length;
    }

    /** Check if position is on the road surface */
    isOnRoad(px: number, pz: number): boolean {
        let minDist = Infinity;
        for (let i = 0; i < this.points.length; i += 4) {
            const p = this.points[i];
            const d = Math.sqrt((p.x - px) ** 2 + (p.z - pz) ** 2);
            if (d < minDist) minDist = d;
        }
        return minDist < TRACK_WIDTH * 0.55;
    }

    /** Get track elevation at a position */
    getElevation(px: number, pz: number): number {
        let best = 0, bestDist = Infinity;
        for (let i = 0; i < this.points.length; i += 2) {
            const p = this.points[i];
            const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return this.points[best].y;
    }

    /** Get position and tangent at t [0,1] */
    getPointAt(t: number): { pos: THREE.Vector3; tangent: THREE.Vector3 } {
        return {
            pos: this.curve.getPointAt(t),
            tangent: this.curve.getTangentAt(t).normalize(),
        };
    }

    /** Is t inside the tunnel? */
    isInTunnel(t: number): boolean {
        return t >= TUNNEL_T_RANGE[0] && t <= TUNNEL_T_RANGE[1];
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
            // Perpendicular (right) vector on XZ plane
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

        // Center stripe
        this.buildCenterLine();
    }

    private buildCenterLine() {
        const pts = [];
        for (let i = 0; i <= TRACK_SEGMENTS; i += 4) {
            const p = this.points[i];
            pts.push(new THREE.Vector3(p.x, p.y + 0.05, p.z));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
        this.group.add(new THREE.Line(geo, mat));
    }

    private buildBarriers() {
        const halfW = TRACK_WIDTH / 2 + 0.5;
        const barrierMat = new THREE.MeshStandardMaterial({
            color: 0xff2288, emissive: 0xff0066, emissiveIntensity: 0.7, flatShading: true,
        });

        for (let side = -1; side <= 1; side += 2) {
            const positions: THREE.Vector3[] = [];
            for (let i = 0; i <= TRACK_SEGMENTS; i += 8) {
                const p = this.points[i];
                const t = this.tangents[i];
                const rx = t.z * side, rz = -t.x * side;
                positions.push(new THREE.Vector3(p.x + rx * halfW, p.y + 0.4, p.z + rz * halfW));
            }
            // Barrier posts
            const postGeo = new THREE.BoxGeometry(0.3, 0.8, 0.3);
            positions.forEach(pos => {
                const post = new THREE.Mesh(postGeo, barrierMat);
                post.position.copy(pos);
                this.group.add(post);
            });
        }
    }

    private buildEnvironment() {
        this.buildGround();
        this.buildBuildings();
        this.buildNeonSigns();
        this.buildTunnel();
        this.buildLights();
    }

    private buildGround() {
        const geo = new THREE.PlaneGeometry(1200, 1200);
        const mat = new THREE.MeshStandardMaterial({ color: 0x22223a, flatShading: true, emissive: 0x0a0a18, emissiveIntensity: 0.2 });
        const ground = new THREE.Mesh(geo, mat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        this.group.add(ground);
    }

    private buildBuildings() {
        const colors = [0x0a0a1a, 0x12122a, 0x0f0f25, 0x1a1a35];
        const rng = this.seededRNG(42);

        for (let i = 0; i < 120; i++) {
            const w = 8 + rng() * 25;
            const h = 15 + rng() * 80;
            const d = 8 + rng() * 25;
            const geo = new THREE.BoxGeometry(w, h, d);
            const mat = new THREE.MeshStandardMaterial({
                color: colors[Math.floor(rng() * colors.length)],
                flatShading: true,
            });
            const bld = new THREE.Mesh(geo, mat);

            // Place outside the track area
            const angle = rng() * Math.PI * 2;
            const dist = 80 + rng() * 350;
            const cx = 170 + Math.cos(angle) * dist;
            const cz = 200 + Math.sin(angle) * dist;

            // Skip if too close to road
            if (this.isOnRoad(cx, cz)) continue;

            bld.position.set(cx, h / 2, cz);
            bld.castShadow = true;
            this.group.add(bld);

            // Neon edge lights on some buildings
            if (rng() > 0.5) {
                const neonColor = [0x00ffff, 0xff0080, 0x8000ff, 0x00ff80][Math.floor(rng() * 4)];
                const edgeMat = new THREE.MeshStandardMaterial({
                    color: neonColor, emissive: neonColor, emissiveIntensity: 0.8,
                });
                const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), edgeMat);
                edge.position.set(cx, h, cz);
                this.group.add(edge);
            }
        }
    }

    private buildNeonSigns() {
        const signTexts = [0x00ffff, 0xff0080, 0xffff00, 0x00ff80, 0x8000ff];
        const rng = this.seededRNG(99);

        for (let i = 0; i < 30; i++) {
            const t = rng();
            const { pos, tangent } = this.getPointAt(t);
            const side = rng() > 0.5 ? 1 : -1;
            const offset = TRACK_WIDTH * 0.6 + 3 + rng() * 8;

            const sx = pos.x + tangent.z * side * offset;
            const sz = pos.z - tangent.x * side * offset;

            const color = signTexts[Math.floor(rng() * signTexts.length)];
            const mat = new THREE.MeshStandardMaterial({
                color, emissive: color, emissiveIntensity: 1.0,
            });

            const sign = new THREE.Mesh(new THREE.BoxGeometry(3 + rng() * 4, 1 + rng() * 2, 0.2), mat);
            sign.position.set(sx, 4 + rng() * 6, sz);
            sign.rotation.y = Math.atan2(tangent.x, tangent.z);
            this.group.add(sign);
        }
    }

    private buildTunnel() {
        const [tStart, tEnd] = TUNNEL_T_RANGE;
        const tunnelMat = new THREE.MeshStandardMaterial({
            color: 0x222233, flatShading: true, side: THREE.DoubleSide,
        });

        for (let i = 0; i < 20; i++) {
            const t = tStart + (tEnd - tStart) * (i / 19);
            const { pos, tangent } = this.getPointAt(t);
            const w = TRACK_WIDTH * 0.8;

            // Ceiling
            const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 3), tunnelMat);
            ceil.position.set(pos.x, pos.y + 8, pos.z);
            ceil.rotation.y = Math.atan2(tangent.x, tangent.z);
            this.group.add(ceil);

            // Walls
            for (const side of [-1, 1]) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 3), tunnelMat);
                wall.position.set(
                    pos.x + tangent.z * side * w / 2,
                    pos.y + 4,
                    pos.z - tangent.x * side * w / 2,
                );
                wall.rotation.y = Math.atan2(tangent.x, tangent.z);
                this.group.add(wall);
            }

            // Neon strip on ceiling
            if (i % 3 === 0) {
                const strip = new THREE.Mesh(
                    new THREE.BoxGeometry(w * 0.6, 0.1, 0.3),
                    new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1 }),
                );
                strip.position.set(pos.x, pos.y + 7.7, pos.z);
                strip.rotation.y = Math.atan2(tangent.x, tangent.z);
                this.group.add(strip);
            }
        }
    }

    private buildLights() {
        // Trackside point lights every ~100m — bright enough to illuminate road
        for (let i = 0; i < 60; i++) {
            const t = i / 60;
            const { pos, tangent } = this.getPointAt(t);
            const side = i % 2 === 0 ? 1 : -1;
            const lx = pos.x + tangent.z * side * (TRACK_WIDTH / 2 + 2);
            const lz = pos.z - tangent.x * side * (TRACK_WIDTH / 2 + 2);

            // Warm street light
            const light = new THREE.PointLight(0xffaa66, 2.0, 60);
            light.position.set(lx, 7, lz);
            this.group.add(light);

            // Lamp post with glowing head
            const postMat = new THREE.MeshStandardMaterial({ color: 0x666666, flatShading: true });
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 7, 6), postMat);
            post.position.set(lx, 3.5, lz);
            this.group.add(post);

            // Glowing lamp head
            const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc88, emissive: 0xffaa44, emissiveIntensity: 1.5 });
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.6), headMat);
            head.position.set(lx, 7, lz);
            this.group.add(head);

            // Every 3rd lamp also has a coloured neon accent
            if (i % 3 === 0) {
                const neonColors = [0x00ffff, 0xff0080, 0x8000ff, 0x00ff80];
                const nc = neonColors[i % neonColors.length];
                const neonLight = new THREE.PointLight(nc, 1.2, 35);
                neonLight.position.set(lx, 4, lz);
                this.group.add(neonLight);
            }
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
