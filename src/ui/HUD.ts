import { RaceManager } from '../race/RaceManager';
import { Car } from '../entities/Car';

/**
 * Updates the HTML HUD overlay every frame.
 */
export class HUD {
    private speedEl = document.getElementById('speed-value')!;
    private lapCounterEl = document.getElementById('lap-counter')!;
    private lapTimeEl = document.getElementById('lap-time')!;
    private bestLapEl = document.getElementById('best-lap')!;
    private posValueEl = document.getElementById('position-value')!;
    private posSuffixEl = document.getElementById('position-suffix')!;
    private countdownEl = document.getElementById('countdown')!;
    private overlayEl = document.getElementById('race-overlay')!;

    update(race: RaceManager) {
        const car = race.player;

        // Speed
        this.speedEl.textContent = Math.round(car.getSpeedKmh()).toString();

        // Lap
        const displayLap = Math.min(car.lap, race.totalLaps);
        this.lapCounterEl.textContent = `LAP ${displayLap}/${race.totalLaps}`;

        // Lap time
        this.lapTimeEl.textContent = this.formatTime(car.currentLapTime);

        // Best lap
        if (car.bestLap < Infinity) {
            this.bestLapEl.textContent = `BEST ${this.formatTime(car.bestLap)}`;
        }

        // Position
        const pos = race.getPlayerPosition();
        this.posValueEl.textContent = pos.toString();
        this.posSuffixEl.textContent = race.getPositionSuffix(pos);

        // Countdown
        if (race.state === 'countdown') {
            this.overlayEl.style.pointerEvents = 'all';
            if (race.countdownValue > 0) {
                this.countdownEl.textContent = race.countdownValue.toString();
                this.countdownEl.className = 'visible';
            } else {
                this.countdownEl.textContent = 'GO!';
                this.countdownEl.className = 'visible go';
            }
        } else {
            this.overlayEl.style.pointerEvents = 'none';
            this.countdownEl.className = '';
        }

        // Finished
        if (race.state === 'finished') {
            this.overlayEl.style.pointerEvents = 'all';
            this.countdownEl.textContent = `P${pos}`;
            this.countdownEl.className = 'visible';
        }
    }

    private formatTime(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }
}
