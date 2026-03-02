import { Car } from '../entities/Car';
import { Track } from '../track/Track';
import { AIDriver, AIType } from '../ai/AIDriver';
import { CHECKPOINT_T_VALUES } from '../track/TrackData';
import { InputState } from '../InputManager';
import { resolveCollisions, Collidable } from '../physics/CollisionSystem';
import { TrafficSystem } from '../entities/TrafficSystem';

export type RaceState = 'countdown' | 'racing' | 'finished';

export class RaceManager {
    readonly totalLaps = 3;
    state: RaceState = 'countdown';
    countdownValue = 3;
    private countdownTimer = 0;
    private raceStarted = false;

    readonly player: Car;
    readonly aiDrivers: AIDriver[];
    readonly allCars: Car[];
    traffic: TrafficSystem | null = null;

    /** Positions sorted: index 0 = 1st place */
    positions: Car[] = [];

    constructor(player: Car, aiCars: Car[], track: Track) {
        this.player = player;
        this.allCars = [player, ...aiCars];
        this.aiDrivers = [
            new AIDriver(aiCars[0], AIType.Consistent, track),
            new AIDriver(aiCars[1], AIType.Aggressive, track),
            new AIDriver(aiCars[2], AIType.Adaptive, track),
        ];
        this.positions = [...this.allCars];
    }

    update(dt: number, track: Track, playerInput: InputState) {
        if (this.state === 'countdown') {
            this.countdownTimer += dt;
            if (this.countdownTimer >= 1) {
                this.countdownTimer = 0;
                this.countdownValue--;
                if (this.countdownValue < 0) {
                    this.state = 'racing';
                    setTimeout(() => { this.raceStarted = true; }, 2000);
                }
            }
            return;
        }

        if (this.state === 'finished') return;

        // ── Update player ──
        const playerOnRoad = track.isOnRoad(this.player.state.px, this.player.state.pz);
        this.player.state.isOnRoad = playerOnRoad;
        this.player.state.py = track.getElevation(this.player.state.px, this.player.state.pz);
        const surfaceGrip = playerOnRoad ? 1.0 : 0.55;
        this.player.update(playerInput, dt, surfaceGrip);
        track.constrainToTrack(this.player.state);
        this.updateTrackProgress(this.player, track);

        // ── Update AI ──
        for (const ai of this.aiDrivers) {
            const car = ai.car;
            car.state.isOnRoad = track.isOnRoad(car.state.px, car.state.pz);
            car.state.py = track.getElevation(car.state.px, car.state.pz);
            const aiGrip = car.state.isOnRoad ? 1.0 : 0.6;
            const aiInput = ai.update(dt, this.player, car.lap, this.totalLaps);
            car.update(aiInput, dt, aiGrip);
            track.constrainToTrack(car.state);
            this.updateTrackProgress(car, track);
        }

        // ── Update traffic ──
        if (this.traffic) {
            this.traffic.update(dt);
        }

        // ── Resolve collisions ──
        this.resolveAllCollisions();

        // ── Sort positions ──
        this.positions.sort((a, b) => {
            if (a.lap !== b.lap) return b.lap - a.lap;
            return b.trackT - a.trackT;
        });

        // ── Check finish ──
        if (this.player.lap > this.totalLaps) {
            this.state = 'finished';
        }
    }

    private resolveAllCollisions() {
        // Collect all collidable entities
        const raceCars: Collidable[] = this.allCars.map(c => c.state);
        const trafficCars: Collidable[] = this.traffic ? this.traffic.getCollidables() : [];

        const allEntities = [...raceCars, ...trafficCars];
        const invulnerable = this.traffic
            ? this.traffic.getInvulnerableSet(raceCars.length)
            : new Set<number>();

        // Resolve
        resolveCollisions(allEntities, invulnerable);

        // Mark any traffic cars that got speed reduced as "hit"
        if (this.traffic) {
            for (let i = 0; i < trafficCars.length; i++) {
                const tc = trafficCars[i];
                if (tc.speed < 15) { // was significantly slowed
                    this.traffic.onCollision(i);
                }
            }
        }
    }

    private updateTrackProgress(car: Car, track: Track) {
        const prevT = car.trackT;
        car.trackT = track.getClosestT(car.state.px, car.state.pz);

        // Checkpoint tracking
        for (let i = 0; i < CHECKPOINT_T_VALUES.length; i++) {
            const cpT = CHECKPOINT_T_VALUES[i];
            if (car.trackT >= cpT && prevT < cpT) {
                car.checkpoints |= (1 << i);
            }
        }

        if (!this.raceStarted) return;

        // Lap completion: crossed t=0 boundary with all checkpoints
        const allCPs = (1 << CHECKPOINT_T_VALUES.length) - 1;
        if (prevT > 0.9 && car.trackT < 0.1 && (car.checkpoints & allCPs) === allCPs) {
            car.completeLap();

            if (car.isPlayer) {
                const lastLapTime = car.lapTimes[car.lapTimes.length - 1];
                for (const ai of this.aiDrivers) {
                    ai.onPlayerLapComplete(lastLapTime);
                }
            }
        }
    }

    getPlayerPosition(): number {
        return this.positions.indexOf(this.player) + 1;
    }

    getPositionSuffix(pos: number): string {
        if (pos === 1) return 'st';
        if (pos === 2) return 'nd';
        if (pos === 3) return 'rd';
        return 'th';
    }
}
