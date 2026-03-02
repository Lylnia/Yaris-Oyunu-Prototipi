/**
 * Background music manager.
 * Plays MP3 files from a playlist. User can add their own tracks to public/music/.
 * Provides next/prev/toggle/volume controls.
 */
export class MusicManager {
    private audio: HTMLAudioElement;
    private playlist: string[] = [];
    private currentIndex = 0;
    private _volume = 0.3;
    private _playing = false;

    /** Element to display current track name */
    private trackNameEl: HTMLElement | null;

    constructor() {
        this.audio = new Audio();
        this.audio.loop = false;
        this.audio.volume = this._volume;
        this.trackNameEl = document.getElementById('music-track-name');

        // Auto-advance to next track
        this.audio.addEventListener('ended', () => {
            this.next();
        });

        // Default playlist — user can replace these files in public/music/
        this.playlist = [
            '/music/track1.mp3',
            '/music/track2.mp3',
            '/music/track3.mp3',
        ];

        this.updateUI();
    }

    play() {
        if (this.playlist.length === 0) return;
        this.audio.src = this.playlist[this.currentIndex];
        this.audio.play().catch(() => {
            // Autoplay blocked — will play on next user interaction
        });
        this._playing = true;
        this.updateUI();
    }

    pause() {
        this.audio.pause();
        this._playing = false;
        this.updateUI();
    }

    toggle() {
        if (this._playing) {
            this.pause();
        } else {
            if (this.audio.src) {
                this.audio.play().catch(() => { });
                this._playing = true;
            } else {
                this.play();
            }
            this.updateUI();
        }
    }

    next() {
        if (this.playlist.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        if (this._playing) {
            this.play();
        } else {
            this.updateUI();
        }
    }

    prev() {
        if (this.playlist.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        if (this._playing) {
            this.play();
        } else {
            this.updateUI();
        }
    }

    setVolume(v: number) {
        this._volume = Math.max(0, Math.min(1, v));
        this.audio.volume = this._volume;
    }

    get volume() { return this._volume; }
    get playing() { return this._playing; }
    get currentTrackName(): string {
        if (this.playlist.length === 0) return 'No tracks';
        const src = this.playlist[this.currentIndex];
        // Extract filename without extension and path
        const parts = src.split('/');
        return parts[parts.length - 1].replace(/\.[^.]+$/, '') || 'Unknown';
    }

    fadeOut(durationMs = 1000) {
        const startVol = this.audio.volume;
        const steps = 20;
        const stepTime = durationMs / steps;
        let step = 0;
        const interval = setInterval(() => {
            step++;
            this.audio.volume = startVol * (1 - step / steps);
            if (step >= steps) {
                clearInterval(interval);
                this.pause();
                this.audio.volume = this._volume; // restore for replay
            }
        }, stepTime);
    }

    private updateUI() {
        if (this.trackNameEl) {
            this.trackNameEl.textContent = this._playing
                ? `♫ ${this.currentTrackName}`
                : '♫ --';
        }
    }

    dispose() {
        this.audio.pause();
        this.audio.src = '';
    }
}
