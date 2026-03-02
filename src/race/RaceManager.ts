import { Car } from '../entities/Car';
import { Track } from '../track/Track';
import { AIDriver, AIType } from '../ai/AIDriver';
import { CHECKPOINT_T_VALUES } from '../track/TrackData';
import { InputState } from '../InputManager';

export type RaceState = 'countdown' | 'racing' | 'finished';

export class RaceManager {
    readonly totalLaps = 3;
    state: RaceState = 'countdown';
    countdownValue = 3;
    private countdownTimer = 0;

    readonly player: Car;
    readonly aiDrivers: AIDriver[];
    readonly allCars: Car[];

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

        // Lap completion: crossed t=0 boundary with all checkpoints
        const allCPs = (1 << CHECKPOINT_T_VALUES.length) - 1;
        if (prevT > 0.9 && car.trackT < 0.1 && (car.checkpoints & allCPs) === allCPs) {
            car.completeLap();

            // Notify adaptive AI
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
