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
        this.buildStartFinishLine();
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

    /** Start/finish line data for lap detection */
    getStartFinishLine(): { pos: THREE.Vector3; tangent: THREE.Vector3; perpX: number; perpZ: number } {
        const data = this.getPointAt(0);
        return {
            pos: data.pos,
            tangent: data.tangent,
            perpX: data.tangent.z,
            perpZ: -data.tangent.x,
        };
    }



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
            color: 0x333333, roughness: 0.9, metalness: 0.0,
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
        const wallHeight = 0.8; // Lower, like a guardrail

        const barrierMat = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa, flatShading: true, metalness: 0.5, roughness: 0.5
        });

        for (const side of [-1, 1]) {
            for (let i = 0; i < TRACK_SEGMENTS; i += 6) {
                const p = this.points[i];
                const t = this.tangents[i];
                const rx = t.z * side, rz = -t.x * side;
                const wx = p.x + rx * halfW;
                const wz = p.z + rz * halfW;

                const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, wallHeight, 4), barrierMat);
                wall.position.set(wx, p.y + wallHeight / 2, wz);
                wall.rotation.y = Math.atan2(t.x, t.z);
                this.group.add(wall);
            }
        }
    }

    /** Start/finish line on the track surface */
    private buildStartFinishLine() {
        const sf = this.getPointAt(0);
        const perpX = sf.tangent.z;
        const perpZ = -sf.tangent.x;
        const halfW = TRACK_WIDTH / 2;

        // Checkered pattern: 8 squares wide, 2 rows
        const squareSize = TRACK_WIDTH / 8;
        const checkeredGroup = new THREE.Group();

        const whiteMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, flatShading: true,
        });
        const blackMat = new THREE.MeshStandardMaterial({
            color: 0x111111, flatShading: true,
        });

        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 8; col++) {
                const isWhite = (row + col) % 2 === 0;
                const geo = new THREE.PlaneGeometry(squareSize, squareSize);
                const sq = new THREE.Mesh(geo, isWhite ? whiteMat : blackMat);

                // Position along perpendicular
                const lateralOffset = -halfW + squareSize * (col + 0.5);
                const forwardOffset = -squareSize * 0.5 + row * squareSize;

                sq.position.set(
                    sf.pos.x + perpX * lateralOffset + sf.tangent.x * forwardOffset,
                    sf.pos.y + 0.03,
                    sf.pos.z + perpZ * lateralOffset + sf.tangent.z * forwardOffset,
                );
                sq.rotation.x = -Math.PI / 2;
                sq.rotation.z = -Math.atan2(sf.tangent.x, sf.tangent.z);
                checkeredGroup.add(sq);
            }
        }

        this.group.add(checkeredGroup);

        // Standard Truss gantry over start/finish
        const gantryMat = new THREE.MeshStandardMaterial({
            color: 0x888888, flatShading: true, metalness: 0.8, roughness: 0.4,
        });

        // Left pillar
        const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 12, 0.5), gantryMat);
        pillarL.position.set(
            sf.pos.x - perpX * (halfW + 2), sf.pos.y + 6,
            sf.pos.z - perpZ * (halfW + 2),
        );
        this.group.add(pillarL);

        // Right pillar
        const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 12, 0.5), gantryMat);
        pillarR.position.set(
            sf.pos.x + perpX * (halfW + 2), sf.pos.y + 6,
            sf.pos.z + perpZ * (halfW + 2),
        );
        this.group.add(pillarR);

        // Crossbar
        const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, TRACK_WIDTH + 4), gantryMat);
        crossbar.position.set(sf.pos.x, sf.pos.y + 12, sf.pos.z);
        crossbar.rotation.y = Math.atan2(perpX, perpZ);
        this.group.add(crossbar);

        // Banner on crossbar
        const bannerMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, flatShading: true });
        const banner = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.0, TRACK_WIDTH), bannerMat);
        banner.position.set(sf.pos.x, sf.pos.y + 11.5, sf.pos.z);
        banner.rotation.y = Math.atan2(perpX, perpZ);
        this.group.add(banner);
    }

    private buildEnvironment() {
        this.buildGround();
        this.buildGrandstands();
        this.buildBillboards();
        this.buildOuterFences();
        this.buildGroundDetails();
        this.buildForest();
        this.buildDistantMountains();
    }

    private buildGround() {
        // Main grassy ground
        const geo = new THREE.PlaneGeometry(2400, 2400);
        // Turn off flatShading for the ground to make it smoother
        const mat = new THREE.MeshStandardMaterial({
            color: 0x3d5c2d, roughness: 1.0, metalness: 0.1
        });
        const ground = new THREE.Mesh(geo, mat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        this.group.add(ground);

        // Add a subtle grid to give a sense of scale and texture to the grass
        const grid = new THREE.GridHelper(2400, 120, 0x000000, 0x000000);
        (grid.material as THREE.Material).opacity = 0.08;
        (grid.material as THREE.Material).transparent = true;
        grid.position.y = -0.05;
        this.group.add(grid);
    }

    private buildGrandstands() {
        const rng = this.seededRNG(42);

        const standPositions = [
            { x: 190, z: -100, w: 20, h: 25, d: 80 },
            { x: 195, z: 100, w: 20, h: 30, d: 80 },
            { x: -190, z: -100, w: 20, h: 25, d: 80 },
            { x: -195, z: 100, w: 20, h: 30, d: 80 },
            // Additional smaller stands near turns
            { x: 60, z: 340, w: 15, h: 18, d: 50 },
            { x: -60, z: 340, w: 15, h: 20, d: 50 },
            { x: 60, z: -340, w: 15, h: 18, d: 50 },
            { x: -60, z: -340, w: 15, h: 20, d: 50 },
        ];

        const standMat = new THREE.MeshStandardMaterial({ color: 0x1a1a35, flatShading: true });

        standPositions.forEach(s => {
            const geo = new THREE.BoxGeometry(s.w, s.h, s.d);
            const stand = new THREE.Mesh(geo, standMat);
            stand.position.set(s.x, s.h / 2, s.z);
            // castShadow removed for GPU perf — only cars cast shadows
            this.group.add(stand);

            const neonColors = [0x00ffff, 0xff0080, 0x8000ff, 0x00ff80];
            const nc = neonColors[Math.floor(rng() * 4)];
            const edgeMat = new THREE.MeshStandardMaterial({
                color: nc, emissive: nc, emissiveIntensity: 1.0,
            });
            const edge = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.5, 0.4, s.d + 0.5), edgeMat);
            edge.position.set(s.x, s.h, s.z);
            this.group.add(edge);

            // Seated crowd effect: rows of small boxes on stands
            const rowMat = new THREE.MeshStandardMaterial({ color: 0x333355, flatShading: true });
            for (let r = 0; r < 4; r++) {
                const rowGeo = new THREE.BoxGeometry(s.w - 2, 0.8, s.d - 4);
                const row = new THREE.Mesh(rowGeo, rowMat);
                row.position.set(s.x, s.h * 0.2 + r * (s.h * 0.2), s.z);
                this.group.add(row);
            }
        });

        // ── Inner field: pit building ──
        const pitMat = new THREE.MeshStandardMaterial({ color: 0x222240, flatShading: true });
        const pit = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 50), pitMat);
        pit.position.set(0, 4, 0);
        this.group.add(pit);

        const pitRoofMat = new THREE.MeshStandardMaterial({
            color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.6,
        });
        const pitRoof = new THREE.Mesh(new THREE.BoxGeometry(31, 0.3, 51), pitRoofMat);
        pitRoof.position.set(0, 8, 0);
        this.group.add(pitRoof);

        // ── Control tower ──
        const towerMat = new THREE.MeshStandardMaterial({ color: 0x1a1a30, flatShading: true });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 35, 8), towerMat);
        tower.position.set(40, 17.5, -60);
        this.group.add(tower);
        const towerTop = new THREE.Mesh(
            new THREE.BoxGeometry(12, 6, 12),
            new THREE.MeshStandardMaterial({
                color: 0x88ccff, emissive: 0x446688, emissiveIntensity: 0.5,
                transparent: true, opacity: 0.7,
            }),
        );
        towerTop.position.set(40, 38, -60);
        this.group.add(towerTop);

        // Removed buildings to give an open environment feel
    }

    private buildBillboards() {
        const rng = this.seededRNG(99);

        // Replace neon signs with daylight solid billboards
        const boardMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, flatShading: true });
        const postMat = new THREE.MeshStandardMaterial({ color: 0x444444, flatShading: true });

        for (let i = 0; i < 15; i++) {
            const t = rng();
            const { pos, tangent } = this.getPointAt(t);
            const side = rng() > 0.5 ? 1 : -1;
            const offset = TRACK_WIDTH * 0.6 + 5 + rng() * 10;
            const sx = pos.x + tangent.z * side * offset;
            const sz = pos.z - tangent.x * side * offset;

            const sign = new THREE.Mesh(new THREE.BoxGeometry(6 + rng() * 4, 3, 0.5), boardMat);
            sign.position.set(sx, 6 + rng() * 2, sz);
            sign.rotation.y = Math.atan2(tangent.x, tangent.z);
            this.group.add(sign);

            // Support poles
            const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 4), postMat);
            pole1.position.set(sx + 2.5, 4, sz);
            this.group.add(pole1);

            const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 4), postMat);
            pole2.position.set(sx - 2.5, 4, sz);
            this.group.add(pole2);
        }
    }
    /** Outer fence behind barriers */
    private buildOuterFences() {
        const halfW = TRACK_WIDTH / 2 + 3;
        const fenceMat = new THREE.MeshStandardMaterial({
            color: 0x444466, flatShading: true, transparent: true, opacity: 0.5,
        });

        // Reduced fence density: every 24 segments instead of 12
        const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });
        for (const side of [-1, 1]) {
            for (let i = 0; i < TRACK_SEGMENTS; i += 24) {
                const p = this.points[i];
                const t = this.tangents[i];
                const rx = t.z * side, rz = -t.x * side;
                const fx = p.x + rx * halfW;
                const fz = p.z + rz * halfW;

                const post = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.06, 0.06, 3, 4),
                    postMat,
                );
                post.position.set(fx, 1.5, fz);
                this.group.add(post);

                const panel = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.5), fenceMat);
                panel.position.set(fx, 1.5, fz);
                panel.rotation.y = Math.atan2(t.x, t.z);
                this.group.add(panel);
            }
        }
    }

    /** Ground detail patches — grass, gravel, etc */
    private buildGroundDetails() {
        const rng = this.seededRNG(123);

        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x4a7c33, flatShading: true, roughness: 1.0
        });
        const sandMat = new THREE.MeshStandardMaterial({
            color: 0x887b5a, flatShading: true, roughness: 1.0
        });

        for (let i = 0; i < 40; i++) {
            const t = rng();
            const { pos, tangent } = this.getPointAt(t);
            const side = rng() > 0.5 ? 1 : -1;
            const offset = TRACK_WIDTH * 0.6 + 2 + rng() * 8;
            const px = pos.x + tangent.z * side * offset;
            const pz = pos.z - tangent.x * side * offset;

            const isGrass = rng() > 0.3;
            const size = 5 + rng() * 15;
            const patch = new THREE.Mesh(
                new THREE.PlaneGeometry(size, size),
                isGrass ? grassMat : sandMat,
            );
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(px, 0, pz);
            this.group.add(patch);
        }

        // Grid lines near start/finish (pit lane markings)
        const lineMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2,
        });
        const sf = this.getPointAt(0);
        for (let i = -3; i <= 3; i++) {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 0.15), lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(
                sf.pos.x + sf.tangent.x * i * 5,
                sf.pos.y + 0.02,
                sf.pos.z + sf.tangent.z * i * 5,
            );
            line.rotation.z = -Math.atan2(sf.tangent.x, sf.tangent.z);
            this.group.add(line);
        }
    }

    private buildForest() {
        const rng = this.seededRNG(888);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9, metalness: 0.1 });
        const leafColors = [0x225533, 0x2e6f3b, 0x1f4726, 0x3d7a44];

        // Use instancing for large number of trees
        const treeCount = 1200;
        const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 6, 8); // slightly rounder trunks
        const crownGeo = new THREE.ConeGeometry(3.5, 8, 8);

        const trunkMatrix = new THREE.Matrix4();
        const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);

        // Instanced crowns needed per color
        const crownMats = leafColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
        const crownInsts = crownMats.map(mat => new THREE.InstancedMesh(crownGeo, mat, treeCount));
        const colorCounts = [0, 0, 0, 0];

        for (let i = 0; i < treeCount; i++) {
            const angle = rng() * Math.PI * 2;
            const dist = 60 + rng() * 300; // trees mostly outside the oval
            const tx = Math.cos(angle) * dist * (rng() > 0.5 ? 1 : 2.5); // spread wider horizontally
            const tz = Math.sin(angle) * dist;

            // skip if on track
            if (this.isNearTrack(tx, tz, 25)) continue;

            const scale = 0.8 + rng() * 0.7;
            const h = 6 * scale;

            trunkMatrix.identity();
            trunkMatrix.makeTranslation(tx, h / 2, tz);
            trunkMatrix.scale(new THREE.Vector3(scale, scale, scale));
            trunkInst.setMatrixAt(i, trunkMatrix);

            const colorIdx = Math.floor(rng() * 4);
            const cCount = colorCounts[colorIdx];

            trunkMatrix.identity();
            trunkMatrix.makeRotationY(rng() * Math.PI);
            trunkMatrix.setPosition(tx, h + (8 * scale) * 0.4, tz);
            trunkMatrix.scale(new THREE.Vector3(scale, scale, scale));
            crownInsts[colorIdx].setMatrixAt(cCount, trunkMatrix);

            colorCounts[colorIdx]++;
        }

        trunkInst.instanceMatrix.needsUpdate = true;
        this.group.add(trunkInst);

        crownInsts.forEach((inst, idx) => {
            inst.count = colorCounts[idx];
            inst.instanceMatrix.needsUpdate = true;
            this.group.add(inst);
        });
    }

    /** Stadium floodlight towers at 4 corners */
    private buildFloodlightTowers() {
        const positions = [
            { x: 200, z: 280 },
            { x: -200, z: 280 },
            { x: 200, z: -280 },
            { x: -200, z: -280 },
        ];

        const towerMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const lightHeadMat = new THREE.MeshStandardMaterial({
            color: 0xffcc88,
        });

        positions.forEach(p => {
            // Tower structure
            const base = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), towerMat);
            base.position.set(p.x, 1, p.z);
            this.group.add(base);

            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 45, 6), towerMat);
            pole.position.set(p.x, 22.5, p.z);
            this.group.add(pole);

            // Light head array (4 panels)
            for (let li = 0; li < 4; li++) {
                const head = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.5, 0.3), lightHeadMat);
                const angle = (li / 4) * Math.PI * 0.5 - Math.PI * 0.25;
                head.position.set(
                    p.x + Math.cos(angle) * 1.5,
                    45,
                    p.z + Math.sin(angle) * 1.5,
                );
                head.rotation.x = 0.5; // angled downward
                this.group.add(head);
            }

            // Spotlight pointing at track
            // Emissive head only — no PointLight
            const glowHead = new THREE.Mesh(
                new THREE.BoxGeometry(3, 2, 3),
                new THREE.MeshStandardMaterial({
                    color: 0xffeedd,
                }),
            );
            glowHead.position.set(p.x, 45, p.z);
            this.group.add(glowHead);
        });
    }

    /** Parking lots near grandstands — InstancedMesh for perf */
    private buildParkingLots() {
        const rng = this.seededRNG(200);

        const lots = [
            { x: 220, z: 0, rows: 4, cols: 8 },
            { x: -220, z: 0, rows: 4, cols: 8 },
            { x: 100, z: 360, rows: 3, cols: 6 },
            { x: -100, z: -360, rows: 3, cols: 6 },
        ];

        const parkingMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a3a, roughness: 0.9,
        });

        // Collect all parked car transforms
        const carTransforms: THREE.Matrix4[] = [];
        const matrix = new THREE.Matrix4();

        lots.forEach(lot => {
            const pw = lot.cols * 3.5 + 4;
            const ph = lot.rows * 5 + 4;
            const parkGround = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), parkingMat);
            parkGround.rotation.x = -Math.PI / 2;
            parkGround.position.set(lot.x, 0, lot.z);
            this.group.add(parkGround);

            for (let r = 0; r < lot.rows; r++) {
                for (let c = 0; c < lot.cols; c++) {
                    if (rng() < 0.2) { rng(); continue; }
                    const cx = lot.x + (c - lot.cols / 2) * 3.5;
                    const cz = lot.z + (r - lot.rows / 2) * 5;
                    rng(); // consume color rng
                    const rot = (rng() - 0.5) * 0.1;
                    matrix.identity();
                    matrix.makeRotationY(rot);
                    matrix.setPosition(cx, 0.4, cz);
                    carTransforms.push(matrix.clone());
                }
            }
        });

        // Single InstancedMesh for all parked cars
        if (carTransforms.length > 0) {
            const carGeo = new THREE.BoxGeometry(1.5, 0.8, 3.2);
            const carMat = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.6, metalness: 0.3 });
            const inst = new THREE.InstancedMesh(carGeo, carMat, carTransforms.length);
            carTransforms.forEach((m, i) => inst.setMatrixAt(i, m));
            inst.instanceMatrix.needsUpdate = true;
            this.group.add(inst);
        }
    }

    /** Simple starfield using points */
    private buildStarfield() {
        const starCount = 500;
        const positions = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.45; // upper hemisphere
            const r = 500 + Math.random() * 200;

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1.2,
            transparent: true,
            opacity: 0.7,
            sizeAttenuation: true,
        });

        const stars = new THREE.Points(geo, mat);
        this.group.add(stars);
    }

    private buildDistantMountains() {
        const mountainCount = 18;
        const radius = 900;
        const mountainGeo = new THREE.ConeGeometry(250, 450, 16);
        const mountainMat = new THREE.MeshStandardMaterial({
            color: 0x3d4a2d, roughness: 0.9, metalness: 0.0,
        });

        const rng = this.seededRNG(555);

        for (let i = 0; i < mountainCount; i++) {
            const angle = (i / mountainCount) * Math.PI * 2 + rng() * 0.5;
            const dist = radius + rng() * 200;
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;

            const heightSq = 0.6 + rng() * 0.6;
            const widthSq = 0.8 + rng() * 0.6;

            const mnt = new THREE.Mesh(mountainGeo, mountainMat);
            mnt.position.set(x, 450 * heightSq * 0.5 - 50, z);
            mnt.scale.set(widthSq, heightSq, widthSq);
            mnt.rotation.y = rng() * Math.PI;
            this.group.add(mnt);
        }
    }

    private seededRNG(seed: number) {
        let s = seed;
        return () => {
            s = (s * 16807 + 0) % 2147483647;
            return s / 2147483647;
        };
    }

    /** Check if a point is near the track centerline (with buffer) */
    private isNearTrack(px: number, pz: number, buffer: number): boolean {
        for (let i = 0; i < this.points.length; i += 8) {
            const p = this.points[i];
            const d = Math.sqrt((p.x - px) ** 2 + (p.z - pz) ** 2);
            if (d < buffer) return true;
        }
        return false;
    }

    /** Mountain/hill terrain surrounding the track to prevent black skyline */
    private buildTerrain() {
        const rng = this.seededRNG(500);

        // Ring 1: Near hills — fewer, simpler for Intel HD
        const hillMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a2e, roughness: 0.9, metalness: 0.1,
            emissive: 0x0a0a15, emissiveIntensity: 0.15,
        });

        for (let i = 0; i < 18; i++) {
            const angle = (i / 18) * Math.PI * 2 + rng() * 0.3;
            const dist = 420 + rng() * 180;
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const h = 15 + rng() * 30;
            const r = 20 + rng() * 30;

            const hill = new THREE.Mesh(
                new THREE.ConeGeometry(r, h, 8),
                hillMat,
            );
            hill.position.set(x, h * 0.4, z);
            this.group.add(hill);
        }

        // Ring 2: Mid mountains
        const midMat = new THREE.MeshStandardMaterial({
            color: 0x141428, roughness: 0.9, metalness: 0.1,
            emissive: 0x080812, emissiveIntensity: 0.1,
        });

        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 + rng() * 0.4;
            const dist = 620 + rng() * 230;
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const h = 40 + rng() * 60;
            const r = 30 + rng() * 50;

            const mtn = new THREE.Mesh(
                new THREE.ConeGeometry(r, h, 12),
                midMat,
            );
            mtn.position.set(x, h * 0.4, z);
            this.group.add(mtn);
        }

        // Ring 3: Far peaks (tall, distant) — 850-1100m
        const farMat = new THREE.MeshStandardMaterial({
            color: 0x0e0e20, roughness: 1.0,
            emissive: 0x06060e, emissiveIntensity: 0.08,
        });

        for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2 + rng() * 0.5;
            const dist = 850 + rng() * 250;
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const h = 60 + rng() * 100;
            const r = 40 + rng() * 70;

            const peak = new THREE.Mesh(
                new THREE.ConeGeometry(r, h, 16),
                farMat,
            );
            peak.position.set(x, h * 0.35, z);
            this.group.add(peak);
        }

        // Distant ground ring to ensure no black horizon
        const distGroundMat = new THREE.MeshStandardMaterial({
            color: 0x161628, roughness: 1.0,
            emissive: 0x080810, emissiveIntensity: 0.1,
        });
        const distGround = new THREE.Mesh(
            new THREE.RingGeometry(600, 1200, 64),
            distGroundMat,
        );
        distGround.rotation.x = -Math.PI / 2;
        distGround.position.y = -0.05;
        this.group.add(distGround);
    }
}
