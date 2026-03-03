const fs = require('fs');
let code = fs.readFileSync('src/track/Track.ts', 'utf8');

const startBillboards = code.indexOf('    private buildBillboards() {');
const endMountains = code.indexOf('    private seededRNG(seed: number) {') - 1;

const replacement = `    private buildBillboards() {
        const rng = this.seededRNG(99);
        const boardMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, flatShading: true });
        const postMat = new THREE.MeshStandardMaterial({ color: 0x444444, flatShading: true });

        for (let i = 0; i < 15; i++) {
            const t = rng();
            const { pos, tangent } = this.getPointAt(t);
            const side = rng() > 0.5 ? 1 : -1;
            const offset = 18 * 0.6 + 5 + rng() * 10;
            const sx = pos.x + tangent.z * side * offset;
            const sz = pos.z - tangent.x * side * offset;

            const sign = new THREE.Mesh(new THREE.BoxGeometry(6 + rng() * 4, 3, 0.5), boardMat);
            sign.position.set(sx, 6 + rng() * 2, sz);
            sign.rotation.y = Math.atan2(tangent.x, tangent.z);
            this.group.add(sign);

            const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 4), postMat);
            pole1.position.set(sx + 2.5, 4, sz);
            this.group.add(pole1);
            
            const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 4), postMat);
            pole2.position.set(sx - 2.5, 4, sz);
            this.group.add(pole2);
        }
    }

    private buildOuterFences() {
        const halfW = 18 / 2 + 3;
        const fenceMat = new THREE.MeshStandardMaterial({
            color: 0x444466, flatShading: true, transparent: true, opacity: 0.5,
        });

        const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });
        for (const side of [-1, 1]) {
            for (let i = 0; i < 600; i += 24) { // TRACK_SEGMENTS is 600
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
            const offset = 18 * 0.6 + 2 + rng() * 8;
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
        
        const lineMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2,
        });
        const sf = this.getPointAt(0);
        for (let i = -3; i <= 3; i++) {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(18, 0.15), lineMat);
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
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, flatShading: true });
        const leafColors = [0x225533, 0x2e6f3b, 0x1f4726, 0x3d7a44];
        
        const treeCount = 1200;
        const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 6, 5);
        const crownGeo = new THREE.ConeGeometry(3.5, 8, 6);
        
        const trunkMatrix = new THREE.Matrix4();
        const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
        
        const crownMats = leafColors.map(c => new THREE.MeshStandardMaterial({ color: c, flatShading: true }));
        const crownInsts = crownMats.map(mat => new THREE.InstancedMesh(crownGeo, mat, treeCount));
        const colorCounts = [0, 0, 0, 0];

        for (let i = 0; i < treeCount; i++) {
            const angle = rng() * Math.PI * 2;
            const dist = 60 + rng() * 300;
            const tx = Math.cos(angle) * dist * (rng() > 0.5 ? 1 : 2.5);
            const tz = Math.sin(angle) * dist;

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

    private buildDistantMountains() {
        const mountainCount = 18;
        const radius = 900;
        const mountainGeo = new THREE.ConeGeometry(250, 450, 8);
        const mountainMat = new THREE.MeshStandardMaterial({
            color: 0x3d4a2d, flatShading: true, roughness: 1.0,
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
`;

code = code.substring(0, startBillboards) + replacement + code.substring(endMountains);

const endTerrain = code.indexOf('    /** Mountain/hill terrain');
if (endTerrain !== -1) {
    code = code.substring(0, endTerrain) + '}\n';
}

fs.writeFileSync('src/track/Track.ts', code);
