import { RaceManager } from '../race/RaceManager';

/**
 * Updates the HTML HUD overlay every frame.
 * Also handles toast notifications for music and camera changes.
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
    private gearEl = document.getElementById('gear-indicator')!;
    private finishOverlay = document.getElementById('finish-overlay')!;
    private finishPos = document.getElementById('finish-position')!;
    private finishTimes = document.getElementById('finish-times')!;
    private musicToast = document.getElementById('music-toast')!;

    private musicToastTimer: ReturnType<typeof setTimeout> | null = null;

    update(race: RaceManager) {
        const car = race.player;

        // Speed (absolute value for reverse)
        const speedKmh = Math.abs(car.getSpeedKmh());
        this.speedEl.textContent = Math.round(speedKmh).toString();

        // Gear indicator
        if (car.state.isReversing) {
            this.gearEl.textContent = 'R';
            this.gearEl.className = 'gear-reverse';
        } else {
            this.gearEl.textContent = 'D';
            this.gearEl.className = 'gear-drive';
        }

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

        // Finished — show detailed results
        if (race.state === 'finished') {
            this.overlayEl.style.pointerEvents = 'all';
            this.countdownEl.textContent = '';
            this.countdownEl.className = '';

            this.finishOverlay.style.display = 'flex';
            this.finishPos.textContent = `P${pos}`;

            // Build lap times list
            let timesHTML = '';
            car.lapTimes.forEach((lt, i) => {
                const isBest = lt === car.bestLap;
                timesHTML += `<div class="finish-lap-row${isBest ? ' best' : ''}">
                    <span>LAP ${i + 1}</span>
                    <span>${this.formatTime(lt)}</span>
                </div>`;
            });
            this.finishTimes.innerHTML = timesHTML;
        }
    }

    /** Show NFS-style music track notification */
    showMusicToast(trackName: string) {
        if (!this.musicToast) return;
        this.musicToast.innerHTML = `<span class="music-icon">♫</span> <span class="music-name">${trackName}</span>`;
        this.musicToast.classList.add('visible');

        // Clear previous timer
        if (this.musicToastTimer) clearTimeout(this.musicToastTimer);

        // Hide after 4 seconds
        this.musicToastTimer = setTimeout(() => {
            this.musicToast.classList.remove('visible');
        }, 4000);
    }

    /** Show camera mode notification */
    showCameraToast(mode: string) {
        if (!this.musicToast) return;
        this.musicToast.innerHTML = `<span class="music-icon">📷</span> <span class="music-name">${mode} Cam</span>`;
        this.musicToast.classList.add('visible');

        if (this.musicToastTimer) clearTimeout(this.musicToastTimer);
        this.musicToastTimer = setTimeout(() => {
            this.musicToast.classList.remove('visible');
        }, 2000);
    }

    /** Reset HUD for soft restart */
    reset() {
        this.bestLapEl.textContent = 'BEST --:--.---';
        this.finishOverlay.style.display = 'none';
        this.finishTimes.innerHTML = '';
        this.countdownEl.textContent = '';
        this.countdownEl.className = '';
    }

    private formatTime(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }
}
