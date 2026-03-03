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

                if (i % 18 === 0) {
                    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 4), topStripeMat);
                    stripe.position.set(wx, p.y + wallHeight + 0.08, wz);
                    stripe.rotation.y = Math.atan2(t.x, t.z);
                    this.group.add(stripe);
                }
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
            color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3, flatShading: true,
        });
        const blackMat = new THREE.MeshStandardMaterial({
            color: 0x111111, emissive: 0x000000, emissiveIntensity: 0, flatShading: true,
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

        // Neon gantry over start/finish
        const gantryMat = new THREE.MeshStandardMaterial({
            color: 0x444444, flatShading: true, metalness: 0.8, roughness: 0.4,
        });
        const neonMat = new THREE.MeshStandardMaterial({
            color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.5,
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

        // Neon strip on crossbar
        const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, TRACK_WIDTH + 2), neonMat);
        neonStrip.position.set(sf.pos.x, sf.pos.y + 11.5, sf.pos.z);
        neonStrip.rotation.y = Math.atan2(perpX, perpZ);
        this.group.add(neonStrip);

        // Point light at gantry
        // Emissive glow only — no PointLight (GPU too weak)
        const gantryGlow = new THREE.Mesh(
            new THREE.BoxGeometry(4, 1, 4),
            new THREE.MeshStandardMaterial({
                color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 2.0,
            }),
        );
        gantryGlow.position.set(sf.pos.x, sf.pos.y + 11, sf.pos.z);
        this.group.add(gantryGlow);
    }

    private buildEnvironment() {
        this.buildGround();
        this.buildTerrain();
        this.buildGrandstands();
        this.buildNeonSigns();
        this.buildLights();
        this.buildOuterFences();
        this.buildGroundDetails();
        this.buildFloodlightTowers();
        this.buildParkingLots();
        this.buildStarfield();
    }

    private buildGround() {
        // Main ground (expanded to cover visible area)
        const geo = new THREE.PlaneGeometry(2400, 2400);
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

        // ── Trees scattered inside oval ──
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, flatShading: true });
        const leafMat = new THREE.MeshStandardMaterial({
            color: 0x225533, flatShading: true, emissive: 0x112211, emissiveIntensity: 0.2,
        });
        const treeRng = this.seededRNG(77);

        for (let i = 0; i < 50; i++) {
            const tx = -80 + treeRng() * 160;
            const tz = -180 + treeRng() * 360;
            const distFromCenter = Math.sqrt((tx / 120) ** 2 + (tz / 250) ** 2);
            if (distFromCenter > 0.85 || distFromCenter < 0.1) continue;

            const h = 4 + treeRng() * 6;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, h, 5), trunkMat);
            trunk.position.set(tx, h / 2, tz);
            this.group.add(trunk);

            const crown = new THREE.Mesh(new THREE.ConeGeometry(1.5 + treeRng() * 1.5, h * 0.7, 6), leafMat);
            crown.position.set(tx, h + h * 0.25, tz);
            this.group.add(crown);
        }

        // ── Flag poles ──
        const flagColors = [0xff0000, 0x0000ff, 0xffff00, 0x00ff00, 0xff8800];
        for (let i = 0; i < 12; i++) {
            const t = i / 12;
            const { pos, tangent } = this.getPointAt(t);
            const inX = pos.x - tangent.z * (TRACK_WIDTH / 2 + 6);
            const inZ = pos.z + tangent.x * (TRACK_WIDTH / 2 + 6);

            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 10, 4),
                new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true }),
            );
            pole.position.set(inX, 5, inZ);
            this.group.add(pole);

            const flag = new THREE.Mesh(
                new THREE.BoxGeometry(2, 1.2, 0.05),
                new THREE.MeshStandardMaterial({
                    color: flagColors[i % flagColors.length],
                    emissive: flagColors[i % flagColors.length],
                    emissiveIntensity: 0.5,
                }),
            );
            flag.position.set(inX + 1, 9.5, inZ);
            this.group.add(flag);
        }

        // ── Buildings around the outside (InstancedMesh for perf) ──
        // Categorize buildings by size for instancing
        const buildingData: { x: number; z: number; w: number; h: number; d: number }[] = [];
        for (let i = 0; i < 120; i++) {
            const angle = rng() * Math.PI * 2;
            const dist = 250 + rng() * 250;
            const cx = Math.cos(angle) * dist;
            const cz = Math.sin(angle) * dist * 1.3;

            // Extra buffer: skip if too close to track (40m from centerline)
            if (this.isNearTrack(cx, cz, 40)) { rng(); rng(); rng(); continue; }

            buildingData.push({
                x: cx, z: cz,
                w: 8 + rng() * 20, h: 15 + rng() * 50, d: 8 + rng() * 20,
            });
            // consume the rng calls we used to do for unused features
            rng();
        }

        // Group into 3 size buckets and use InstancedMesh
        const small = buildingData.filter(b => b.h < 30);
        const medium = buildingData.filter(b => b.h >= 30 && b.h < 50);
        const large = buildingData.filter(b => b.h >= 50);

        const buildingMat = new THREE.MeshStandardMaterial({
            color: 0x0f0f25, flatShading: true,
        });

        const addBuildingInstances = (items: typeof buildingData, geo: THREE.BoxGeometry) => {
            if (items.length === 0) return;
            const inst = new THREE.InstancedMesh(geo, buildingMat, items.length);
            const matrix = new THREE.Matrix4();
            items.forEach((b, idx) => {
                matrix.identity();
                matrix.makeTranslation(b.x, b.h / 2, b.z);
                const scaleX = b.w / 15;
                const scaleZ = b.d / 15;
                matrix.scale(new THREE.Vector3(scaleX, 1, scaleZ));
                inst.setMatrixAt(idx, matrix);
            });
            inst.instanceMatrix.needsUpdate = true;
            this.group.add(inst);

            // Neon edges as separate instanced mesh
            const neonColors = [0x00ffff, 0xff0080, 0x8000ff, 0x00ff80];
            const neonMat = new THREE.MeshStandardMaterial({
                color: neonColors[0], emissive: neonColors[0], emissiveIntensity: 0.8,
            });
            const edgeGeo = new THREE.BoxGeometry(16, 0.3, 16);
            const neonInst = new THREE.InstancedMesh(edgeGeo, neonMat, items.length);
            items.forEach((b, idx) => {
                matrix.identity();
                matrix.makeTranslation(b.x, b.h, b.z);
                const scaleX = (b.w + 0.3) / 16;
                const scaleZ = (b.d + 0.3) / 16;
                matrix.scale(new THREE.Vector3(scaleX, 1, scaleZ));
                neonInst.setMatrixAt(idx, matrix);
            });
            neonInst.instanceMatrix.needsUpdate = true;
            this.group.add(neonInst);
        };

        addBuildingInstances(small, new THREE.BoxGeometry(15, 22, 15));
        addBuildingInstances(medium, new THREE.BoxGeometry(15, 40, 15));
        addBuildingInstances(large, new THREE.BoxGeometry(15, 60, 15));
    }

    private buildNeonSigns() {
        const colors = [0x00ffff, 0xff0080, 0xffff00, 0x00ff80, 0x8000ff];
        const rng = this.seededRNG(99);

        for (let i = 0; i < 15; i++) {
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

            // Support pole for bigger signs
            if (rng() > 0.4) {
                const poleMat = new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true });
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 4), poleMat);
                pole.position.set(sx, 3, sz);
                this.group.add(pole);
            }
        }
    }

    private buildLights() {
        // NO PointLights at all — Intel HD 5000 can't handle them
        // All light posts remain visually via emissive materials
        const postMat = new THREE.MeshStandardMaterial({ color: 0x666666, flatShading: true });
        const headMat = new THREE.MeshStandardMaterial({
            color: 0xffcc88, emissive: 0xffaa44, emissiveIntensity: 2.5,
        });

        // Reduce to every other post (13 total instead of 25)
        for (let i = 0; i < 25; i += 2) {
            const t = i / 25;
            const { pos, tangent } = this.getPointAt(t);
            const side = i % 4 === 0 ? 1 : -1;
            const lx = pos.x + tangent.z * side * (TRACK_WIDTH / 2 + 3);
            const lz = pos.z - tangent.x * side * (TRACK_WIDTH / 2 + 3);

            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 8, 4), postMat);
            post.position.set(lx, 4, lz);
            this.group.add(post);

            // Bright emissive head instead of PointLight
            const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.0), headMat);
            head.position.set(lx, 8, lz);
            this.group.add(head);
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

        // Grass patches near track
        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x1a3320, flatShading: true, emissive: 0x0a1a10, emissiveIntensity: 0.1,
        });
        const sandMat = new THREE.MeshStandardMaterial({
            color: 0x3a3520, flatShading: true, emissive: 0x1a1a08, emissiveIntensity: 0.05,
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

    /** Stadium floodlight towers at 4 corners */
    private buildFloodlightTowers() {
        const positions = [
            { x: 200, z: 280 },
            { x: -200, z: 280 },
            { x: 200, z: -280 },
            { x: -200, z: -280 },
        ];

        const towerMat = new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true });
        const lightHeadMat = new THREE.MeshStandardMaterial({
            color: 0xffffcc, emissive: 0xffff88, emissiveIntensity: 2.0,
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
                    color: 0xffeedd, emissive: 0xffcc88, emissiveIntensity: 3.0,
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
            color: 0x2a2a3a, flatShading: true,
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
            const carMat = new THREE.MeshStandardMaterial({ color: 0x2a2a33, flatShading: true });
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
            color: 0x1a1a2e, flatShading: true,
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
                new THREE.ConeGeometry(r, h, 4),
                hillMat,
            );
            hill.position.set(x, h * 0.4, z);
            this.group.add(hill);
        }

        // Ring 2: Mid mountains
        const midMat = new THREE.MeshStandardMaterial({
            color: 0x141428, flatShading: true,
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
                new THREE.ConeGeometry(r, h, 4),
                midMat,
            );
            mtn.position.set(x, h * 0.4, z);
            this.group.add(mtn);
        }

        // Ring 3: Far peaks (tall, distant) — 850-1100m
        const farMat = new THREE.MeshStandardMaterial({
            color: 0x0e0e20, flatShading: true,
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
                new THREE.ConeGeometry(r, h, 4),
                farMat,
            );
            peak.position.set(x, h * 0.35, z);
            this.group.add(peak);
        }

        // Distant ground ring to ensure no black horizon
        const distGroundMat = new THREE.MeshStandardMaterial({
            color: 0x161628, flatShading: true,
            emissive: 0x080810, emissiveIntensity: 0.1,
        });
        const distGround = new THREE.Mesh(
            new THREE.RingGeometry(600, 1200, 32),
            distGroundMat,
        );
        distGround.rotation.x = -Math.PI / 2;
        distGround.position.y = -0.05;
        this.group.add(distGround);
    }
}
