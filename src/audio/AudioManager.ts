import { clamp } from '../utils/MathUtils';

/**
 * Procedural audio using Web Audio API.
 * Engine: three oscillators (fundamental + 2nd harmonic + 3rd harmonic) for rich, natural sound.
 * Tires: bandpass-filtered noise with dynamic frequency.
 * Brake: multi-layered rumble + disc squeal + high-frequency hiss.
 * Music: auto-discovers and plays all tracks from public/music/.
 */
export class AudioManager {
    private ctx: AudioContext | null = null;
    private started = false;
    muted = false;
    private fadedOut = false;

    // Engine
    private engOsc1: OscillatorNode | null = null;
    private engOsc2: OscillatorNode | null = null;
    private engOsc3: OscillatorNode | null = null;
    private engGain: GainNode | null = null;
    private engFilter: BiquadFilterNode | null = null;
    private engOsc1Gain: GainNode | null = null;
    private engOsc2Gain: GainNode | null = null;
    private engOsc3Gain: GainNode | null = null;

    // Tire screech
    private tireSource: AudioBufferSourceNode | null = null;
    private tireGain: GainNode | null = null;
    private tireBpf: BiquadFilterNode | null = null;

    // Brake — 3 layers
    private brakeLowSource: AudioBufferSourceNode | null = null;
    private brakeLowGain: GainNode | null = null;
    private brakeMidSource: AudioBufferSourceNode | null = null;
    private brakeMidGain: GainNode | null = null;
    private brakeHiSource: AudioBufferSourceNode | null = null;
    private brakeHiGain: GainNode | null = null;

    // Master gain for muting
    private masterGain: GainNode | null = null;

    // ── Music system ──
    private musicGain: GainNode | null = null;
    private musicSource: AudioBufferSourceNode | null = null;
    private musicTracks: string[] = [];
    private musicBuffers: Map<string, AudioBuffer> = new Map();
    private currentTrackIndex = -1;
    private musicPlaying = false;

    /** Called when a new music track starts playing */
    onTrackChange: ((title: string, artist: string) => void) | null = null;

    init() {
        if (this.started) return;
        this.ctx = new AudioContext();
        this.started = true;
        this.fadedOut = false;

        // Master gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : 1;
        this.masterGain.connect(this.ctx.destination);

        // ── Engine (three oscillators mixed) ──
        const engMix = this.ctx.createGain();
        engMix.gain.value = 1;

        this.engFilter = this.ctx.createBiquadFilter();
        this.engFilter.type = 'lowpass';
        this.engFilter.frequency.value = 800;
        this.engFilter.Q.value = 1.5;

        this.engGain = this.ctx.createGain();
        this.engGain.gain.value = 0;

        // Fundamental — sawtooth for grit
        this.engOsc1 = this.ctx.createOscillator();
        this.engOsc1.type = 'sawtooth';
        this.engOsc1.frequency.value = 45;
        this.engOsc1Gain = this.ctx.createGain();
        this.engOsc1Gain.gain.value = 0.55;
        this.engOsc1.connect(this.engOsc1Gain);
        this.engOsc1Gain.connect(engMix);

        // 2nd harmonic — triangle for body
        this.engOsc2 = this.ctx.createOscillator();
        this.engOsc2.type = 'triangle';
        this.engOsc2.frequency.value = 90;
        this.engOsc2Gain = this.ctx.createGain();
        this.engOsc2Gain.gain.value = 0.3;
        this.engOsc2.connect(this.engOsc2Gain);
        this.engOsc2Gain.connect(engMix);

        // 3rd harmonic — square wave, fades in at high RPM for growl
        this.engOsc3 = this.ctx.createOscillator();
        this.engOsc3.type = 'square';
        this.engOsc3.frequency.value = 135;
        this.engOsc3Gain = this.ctx.createGain();
        this.engOsc3Gain.gain.value = 0; // starts silent, grows with RPM
        this.engOsc3.connect(this.engOsc3Gain);
        this.engOsc3Gain.connect(engMix);

        engMix.connect(this.engFilter);
        this.engFilter.connect(this.engGain);
        this.engGain.connect(this.masterGain);

        this.engOsc1.start();
        this.engOsc2.start();
        this.engOsc3.start();

        // ── Tire screech (bandpass noise) ──
        const noiseLen = this.ctx.sampleRate * 2;
        const noiseBuf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;

        this.tireSource = this.ctx.createBufferSource();
        this.tireSource.buffer = noiseBuf;
        this.tireSource.loop = true;

        this.tireBpf = this.ctx.createBiquadFilter();
        this.tireBpf.type = 'bandpass';
        this.tireBpf.frequency.value = 2500;
        this.tireBpf.Q.value = 3;

        this.tireGain = this.ctx.createGain();
        this.tireGain.gain.value = 0;

        this.tireSource.connect(this.tireBpf);
        this.tireBpf.connect(this.tireGain);
        this.tireGain.connect(this.masterGain);
        this.tireSource.start();

        // ── Brake — Layer 1: Low rumble (80-200Hz) ──
        const brakeBuf1 = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
        const bd1 = brakeBuf1.getChannelData(0);
        // Brownian noise for deeper rumble
        let lastVal = 0;
        for (let i = 0; i < noiseLen; i++) {
            lastVal += (Math.random() * 2 - 1) * 0.1;
            lastVal *= 0.995;
            bd1[i] = lastVal;
        }
        // Normalize
        let max1 = 0;
        for (let i = 0; i < noiseLen; i++) max1 = Math.max(max1, Math.abs(bd1[i]));
        if (max1 > 0) for (let i = 0; i < noiseLen; i++) bd1[i] /= max1;

        this.brakeLowSource = this.ctx.createBufferSource();
        this.brakeLowSource.buffer = brakeBuf1;
        this.brakeLowSource.loop = true;

        const brakeLowFilter = this.ctx.createBiquadFilter();
        brakeLowFilter.type = 'lowpass';
        brakeLowFilter.frequency.value = 200;
        brakeLowFilter.Q.value = 1.2;

        this.brakeLowGain = this.ctx.createGain();
        this.brakeLowGain.gain.value = 0;

        this.brakeLowSource.connect(brakeLowFilter);
        brakeLowFilter.connect(this.brakeLowGain);
        this.brakeLowGain.connect(this.masterGain);
        this.brakeLowSource.start();

        // ── Brake — Layer 2: Mid disc resonance (800-1600Hz) ──
        const brakeBuf2 = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
        const bd2 = brakeBuf2.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) bd2[i] = Math.random() * 2 - 1;

        this.brakeMidSource = this.ctx.createBufferSource();
        this.brakeMidSource.buffer = brakeBuf2;
        this.brakeMidSource.loop = true;

        const brakeMidFilter = this.ctx.createBiquadFilter();
        brakeMidFilter.type = 'bandpass';
        brakeMidFilter.frequency.value = 1200;
        brakeMidFilter.Q.value = 4;

        this.brakeMidGain = this.ctx.createGain();
        this.brakeMidGain.gain.value = 0;

        this.brakeMidSource.connect(brakeMidFilter);
        brakeMidFilter.connect(this.brakeMidGain);
        this.brakeMidGain.connect(this.masterGain);
        this.brakeMidSource.start();

        // ── Brake — Layer 3: High hiss (2500-4000Hz) ──
        const brakeBuf3 = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
        const bd3 = brakeBuf3.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) bd3[i] = Math.random() * 2 - 1;

        this.brakeHiSource = this.ctx.createBufferSource();
        this.brakeHiSource.buffer = brakeBuf3;
        this.brakeHiSource.loop = true;

        const brakeHiFilter = this.ctx.createBiquadFilter();
        brakeHiFilter.type = 'bandpass';
        brakeHiFilter.frequency.value = 3200;
        brakeHiFilter.Q.value = 2.5;

        this.brakeHiGain = this.ctx.createGain();
        this.brakeHiGain.gain.value = 0;

        this.brakeHiSource.connect(brakeHiFilter);
        brakeHiFilter.connect(this.brakeHiGain);
        this.brakeHiGain.connect(this.masterGain);
        this.brakeHiSource.start();

        // ── Music gain node ──
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.25; // music volume (lower than SFX)
        this.musicGain.connect(this.masterGain);

        // ── Auto-discover and play music ──
        this.discoverAndPlayMusic();
    }

    /** Discover music files from public/music/tracks.json (auto-generated by Vite plugin) */
    private async discoverAndPlayMusic() {
        if (!this.ctx) return;

        const discoveredTracks: string[] = [];

        try {
            // Read manifest generated by vite musicManifestPlugin
            const resp = await fetch('/music/tracks.json');
            if (resp.ok) {
                const filenames: string[] = await resp.json();
                for (const name of filenames) {
                    discoveredTracks.push(`/music/${encodeURIComponent(name)}`);
                }
            }
        } catch {
            console.warn('[AudioManager] Could not read /music/tracks.json');
        }

        if (discoveredTracks.length === 0) {
            console.log('[AudioManager] No music files found in /music/');
            return;
        }

        // Sort for consistent order
        discoveredTracks.sort();
        this.musicTracks = discoveredTracks;
        console.log(`[AudioManager] Found ${this.musicTracks.length} music track(s):`, this.musicTracks);

        // Shuffle playlist
        for (let i = this.musicTracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.musicTracks[i], this.musicTracks[j]] = [this.musicTracks[j], this.musicTracks[i]];
        }

        // Start playing first track
        // We do not play it automatically anymore. The Game loop will trigger it on GO!
    }

    public async playNextTrack() {
        if (!this.ctx || this.fadedOut || this.musicTracks.length === 0) return;

        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.musicTracks.length;
        const trackUrl = this.musicTracks[this.currentTrackIndex];
        const { title, artist } = this.getTrackInfo(trackUrl);

        try {
            let buffer = this.musicBuffers.get(trackUrl);
            if (!buffer) {
                const resp = await fetch(trackUrl);
                const arrayBuf = await resp.arrayBuffer();
                buffer = await this.ctx.decodeAudioData(arrayBuf);
                this.musicBuffers.set(trackUrl, buffer);
            }

            // Stop previous source
            if (this.musicSource) {
                try { this.musicSource.stop(); } catch { /* ok */ }
            }

            this.musicSource = this.ctx.createBufferSource();
            this.musicSource.buffer = buffer;
            this.musicSource.connect(this.musicGain!);
            this.musicSource.onended = () => {
                if (!this.fadedOut) this.playNextTrack();
            };
            this.musicSource.start();
            this.musicPlaying = true;

            // Notify UI
            if (this.onTrackChange) {
                this.onTrackChange(title, artist);
            }

            console.log(`[AudioManager] Now playing: ${title} - ${artist}`);
        } catch (e) {
            console.warn(`[AudioManager] Failed to load music: ${trackUrl}`, e);
            // Try next track
            if (this.musicTracks.length > 1) {
                this.playNextTrack();
            }
        }
    }

    private getTrackInfo(url: string): { title: string, artist: string } {
        const filename = decodeURIComponent(url.split('/').pop() || url);
        // Remove extension
        const nameExtStr = filename.replace(/\.[^/.]+$/, '');
        // Split by " - "
        const parts = nameExtStr.split(' - ');
        if (parts.length >= 2) {
            return {
                title: parts[0].trim(),
                artist: parts.slice(1).join(' - ').trim()
            };
        }

        // Fallback
        return {
            title: nameExtStr.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            artist: 'EA Trax'
        };
    }

    setMuted(muted: boolean) {
        this.muted = muted;
        if (this.masterGain) {
            this.masterGain.gain.value = muted ? 0 : 1;
        }
    }

    /** Fade out all audio over ~1 second (for race finish) */
    fadeOut() {
        if (!this.ctx || !this.masterGain || this.fadedOut) return;
        this.fadedOut = true;
        const t = this.ctx.currentTime;
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
        this.masterGain.gain.linearRampToValueAtTime(0, t + 1.0);
    }

    /** Reset audio state for soft restart */
    reset() {
        // Stop music
        if (this.musicSource) {
            try { this.musicSource.stop(); } catch { /* ok */ }
            this.musicSource = null;
        }
        this.musicPlaying = false;
        this.currentTrackIndex = -1;
        this.fadedOut = false;

        // Restore master gain
        if (this.masterGain) {
            this.masterGain.gain.cancelScheduledValues(0);
            this.masterGain.gain.value = this.muted ? 0 : 1;
        }

        // Restart music playlist
        if (this.musicTracks.length > 0) {
            // Re-shuffle
            for (let i = this.musicTracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.musicTracks[i], this.musicTracks[j]] = [this.musicTracks[j], this.musicTracks[i]];
            }
            this.playNextTrack();
        }
    }

    update(rpm: number, isDrifting: boolean, driftAngle: number, braking: number, speed: number) {
        if (!this.ctx || this.fadedOut) return;
        const t = this.ctx.currentTime + 0.05;

        // ── Engine ──
        if (this.engOsc1 && this.engOsc2 && this.engOsc3 && this.engGain && this.engFilter
            && this.engOsc1Gain && this.engOsc2Gain && this.engOsc3Gain) {

            // Non-linear RPM curve: easeInOut for more natural feel
            const rpmCurve = rpm < 0.5
                ? 2 * rpm * rpm
                : 1 - Math.pow(-2 * rpm + 2, 2) / 2;

            // Fundamental: 45Hz idle → 350Hz redline
            const baseFreq = 45 + rpmCurve * 305;
            this.engOsc1.frequency.linearRampToValueAtTime(baseFreq, t);

            // 2nd harmonic: ~2x with slight detune for richness
            const detune2 = 1 + Math.sin(this.ctx.currentTime * 3.5) * 0.008;
            this.engOsc2.frequency.linearRampToValueAtTime(baseFreq * 2.02 * detune2, t);

            // 3rd harmonic: 3x, gains volume at high RPM (growl)
            const detune3 = 1 + Math.sin(this.ctx.currentTime * 5.2) * 0.005;
            this.engOsc3.frequency.linearRampToValueAtTime(baseFreq * 3.01 * detune3, t);

            // 3rd harmonic gain: silent below 50% RPM, rises above
            const osc3Vol = rpm > 0.5 ? (rpm - 0.5) * 0.4 : 0;
            this.engOsc3Gain.gain.linearRampToValueAtTime(osc3Vol, t);

            // Fundamental gets slightly quieter at high RPM to let harmonics through
            const osc1Vol = 0.55 - rpm * 0.1;
            this.engOsc1Gain.gain.linearRampToValueAtTime(osc1Vol, t);

            // 2nd harmonic louder at mid-high RPM
            const osc2Vol = 0.25 + rpm * 0.15;
            this.engOsc2Gain.gain.linearRampToValueAtTime(osc2Vol, t);

            // Overall volume: louder at high RPM
            const vol = 0.04 + rpm * 0.10;
            this.engGain.gain.linearRampToValueAtTime(vol, t);

            // Filter opens with RPM: brighter sound at high rev
            const filterFreq = 400 + rpmCurve * 1800;
            const filterQ = 1.2 + rpm * 2.5;
            this.engFilter.frequency.linearRampToValueAtTime(filterFreq, t);
            this.engFilter.Q.linearRampToValueAtTime(filterQ, t);
        }

        // ── Tire screech ──
        if (this.tireGain && this.tireBpf) {
            const slipVol = isDrifting ? clamp(Math.abs(driftAngle) * 2.0, 0, 0.2) : 0;
            this.tireGain.gain.linearRampToValueAtTime(slipVol, t);
            const tireFreq = 2000 + clamp(speed / 50, 0, 1) * 2000;
            this.tireBpf.frequency.linearRampToValueAtTime(tireFreq, t);
        }

        // ── Brake — multi-layered ──
        const isBraking = braking > 0.15 && speed > 2;
        const brakeFactor = isBraking ? clamp(braking, 0, 1) : 0;
        const speedFactor = clamp(speed / 40, 0, 1); // more sound at higher speed

        // Layer 1: Low rumble — always present when braking
        if (this.brakeLowGain) {
            const lowVol = brakeFactor * 0.12 * speedFactor;
            this.brakeLowGain.gain.linearRampToValueAtTime(lowVol, t);
        }

        // Layer 2: Mid disc — grows with brake pressure & speed
        if (this.brakeMidGain) {
            const midVol = brakeFactor * 0.06 * speedFactor * speedFactor;
            this.brakeMidGain.gain.linearRampToValueAtTime(midVol, t);
        }

        // Layer 3: High hiss — only at high speed + hard braking
        if (this.brakeHiGain) {
            const hiVol = brakeFactor > 0.5 && speed > 15
                ? (brakeFactor - 0.5) * 0.08 * speedFactor
                : 0;
            this.brakeHiGain.gain.linearRampToValueAtTime(hiVol, t);
        }
    }

    dispose() {
        this.engOsc1?.stop();
        this.engOsc2?.stop();
        this.engOsc3?.stop();
        this.tireSource?.stop();
        this.brakeLowSource?.stop();
        this.brakeMidSource?.stop();
        this.brakeHiSource?.stop();
        if (this.musicSource) {
            try { this.musicSource.stop(); } catch { /* ok */ }
        }
        this.ctx?.close();
    }
}
