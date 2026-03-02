import * as THREE from 'three';
import { Track } from '../track/Track';
import { TRACK_WIDTH, TRACK_SEGMENTS } from '../track/TrackData';
import { kmhToMs } from '../utils/MathUtils';
import { Collidable } from '../physics/CollisionSystem';

const TRAFFIC_SPEED = kmhToMs(60); // 60 km/h constant
const TRAFFIC_COUNT = 7;
const INVULN_DURATION = 1.5; // seconds after collision before they can be hit again

interface TrafficCar {
    trackT: number;
    laneOffset: number; // -1 inner, +1 outer
    mesh: THREE.Group;
    state: Collidable;
    invulnTimer: number;
}

/**
 * Traffic system: NPC cars that drive at constant 60 km/h on the track.
 * They stay on the outer lane and recover after being hit.
 */
export class TrafficSystem {
    readonly cars: TrafficCar[] = [];

    constructor(private track: Track, scene: THREE.Scene) {
        const rng = this.seededRNG(333);
        const colors = [0x666688, 0x888888, 0x445566, 0x665544, 0x554466, 0x556644, 0x777777];

        for (let i = 0; i < TRAFFIC_COUNT; i++) {
            const startT = (i / TRAFFIC_COUNT + rng() * 0.05) % 1;
            const laneOffset = rng() > 0.3 ? 1 : -1; // mostly outer lane
            const color = colors[i % colors.length];

            const mesh = this.createTrafficMesh(color);
            scene.add(mesh);

            const pos = this.getWorldPos(startT, laneOffset);
            const tangent = track.getPointAt(startT).tangent;
            const heading = Math.atan2(tangent.x, tangent.z);

            const car: TrafficCar = {
                trackT: startT,
                laneOffset,
                mesh,
                state: {
                    px: pos.x,
                    pz: pos.z,
                    speed: TRAFFIC_SPEED,
                    heading,
                    travelDir: heading,
                },
                invulnTimer: 0,
            };
            this.cars.push(car);
        }
    }

    update(dt: number) {
        // Estimate track length for t-increment
        const trackLen = this.estimateTrackLength();

        for (const car of this.cars) {
            // Invulnerability countdown
            if (car.invulnTimer > 0) {
                car.invulnTimer -= dt;
            }

            // Gradually restore speed to 60 km/h
            if (car.state.speed < TRAFFIC_SPEED) {
                car.state.speed += 8 * dt; // recover ~8 m/s² 
                if (car.state.speed > TRAFFIC_SPEED) car.state.speed = TRAFFIC_SPEED;
            }

            // Advance along track
            const dtIncrement = (car.state.speed * dt) / trackLen;
            car.trackT = (car.trackT + dtIncrement) % 1;

            // Get ideal position
            const idealPos = this.getWorldPos(car.trackT, car.laneOffset);
            const tangent = this.track.getPointAt(car.trackT).tangent;
            const heading = Math.atan2(tangent.x, tangent.z);

            // Smoothly move toward ideal position (allows collision push then recovery)
            const recovery = car.invulnTimer > 0 ? 2 : 6;
            car.state.px += (idealPos.x - car.state.px) * recovery * dt;
            car.state.pz += (idealPos.z - car.state.pz) * recovery * dt;
            car.state.heading = heading;
            car.state.travelDir = heading;

            // Sync mesh
            const elev = this.track.getPointAt(car.trackT).pos.y;
            car.mesh.position.set(car.state.px, elev, car.state.pz);
            car.mesh.rotation.y = heading;
        }
    }

    /** Get collidable states for collision system */
    getCollidables(): Collidable[] {
        return this.cars.map(c => c.state);
    }

    /** Returns set of invulnerable traffic indices */
    getInvulnerableSet(offset: number): Set<number> {
        const s = new Set<number>();
        this.cars.forEach((c, i) => {
            if (c.invulnTimer > 0) s.add(i + offset);
        });
        return s;
    }

    /** Called after collision detected — mark traffic car as hit */
    onCollision(trafficIndex: number) {
        const car = this.cars[trafficIndex];
        if (car && car.invulnTimer <= 0) {
            car.invulnTimer = INVULN_DURATION;
        }
    }

    private getWorldPos(t: number, laneOffset: number): { x: number; z: number } {
        const data = this.track.getPointAt(t);
        const perpX = data.tangent.z;
        const perpZ = -data.tangent.x;
        const lateralDist = laneOffset * (TRACK_WIDTH * 0.3);
        return {
            x: data.pos.x + perpX * lateralDist,
            z: data.pos.z + perpZ * lateralDist,
        };
    }

    private estimateTrackLength(): number {
        // Use 600 segments to estimate total length
        let len = 0;
        let prev = this.track.getPointAt(0).pos;
        for (let i = 1; i <= 20; i++) {
            const p = this.track.getPointAt(i / 20).pos;
            len += prev.distanceTo(p);
            prev = p;
        }
        return len;
    }

    private createTrafficMesh(color: number): THREE.Group {
        const car = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({
            color, flatShading: true, metalness: 0.3, roughness: 0.5,
        });
        const darkMat = new THREE.MeshStandardMaterial({
            color: 0x222222, flatShading: true,
        });
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x88aacc, flatShading: true, transparent: true, opacity: 0.5,
        });
        const tailMat = new THREE.MeshStandardMaterial({
            color: 0xff2200, emissive: 0xff0000, emissiveIntensity: 0.6,
        });

        // Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 3.8), bodyMat);
        body.position.y = 0.4;
        car.add(body);

        // Cabin
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.6), glassMat);
        cabin.position.set(0, 0.85, -0.2);
        car.add(cabin);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 6);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333, flatShading: true });
        [[-0.85, 0.14, 1.1], [0.85, 0.14, 1.1], [-0.85, 0.14, -1.1], [0.85, 0.14, -1.1]].forEach(([x, y, z]) => {
            const w = new THREE.Mesh(wheelGeo, wheelMat);
            w.rotation.z = Math.PI / 2;
            w.position.set(x, y, z);
            car.add(w);
        });

        // Tail lights
        [[-0.5, 0.45, -1.92], [0.5, 0.45, -1.92]].forEach(([x, y, z]) => {
            const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), tailMat);
            tl.position.set(x, y, z);
            car.add(tl);
        });

        // Underbody
        const under = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 3.6), darkMat);
        under.position.y = 0.12;
        car.add(under);

        return car;
    }

    private seededRNG(seed: number) {
        let s = seed;
        return () => {
            s = (s * 16807 + 0) % 2147483647;
            return s / 2147483647;
        };
    }
}
