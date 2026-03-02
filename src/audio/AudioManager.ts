import { clamp } from '../utils/MathUtils';

/**
 * Procedural audio using Web Audio API.
 * Engine: three oscillators (fundamental + 2nd harmonic + 3rd harmonic) for rich, natural sound.
 * Tires: bandpass-filtered noise with dynamic frequency.
 * Brake: multi-layered rumble + disc squeal + high-frequency hiss.
 */
export class AudioManager {
    private ctx: AudioContext | null = null;
    private started = false;
    muted = false;

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

    init() {
        if (this.started) return;
        this.ctx = new AudioContext();
        this.started = true;

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
    }

    setMuted(muted: boolean) {
        this.muted = muted;
        if (this.masterGain) {
            this.masterGain.gain.value = muted ? 0 : 1;
        }
    }

    update(rpm: number, isDrifting: boolean, driftAngle: number, braking: number, speed: number) {
        if (!this.ctx) return;
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

    /** Fade out all sounds over ~1s then stop */
    fadeOut() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime + 1.0;
        this.engGain?.gain.linearRampToValueAtTime(0, t);
        this.tireGain?.gain.linearRampToValueAtTime(0, t);
        this.brakeLowGain?.gain.linearRampToValueAtTime(0, t);
        this.brakeMidGain?.gain.linearRampToValueAtTime(0, t);
        this.brakeHiGain?.gain.linearRampToValueAtTime(0, t);
        if (this.masterGain) this.masterGain.gain.linearRampToValueAtTime(0, t);

        // Stop oscillators after fade
        setTimeout(() => {
            this.engOsc1?.stop();
            this.engOsc2?.stop();
            this.engOsc3?.stop();
            this.tireSource?.stop();
            this.brakeLowSource?.stop();
            this.brakeMidSource?.stop();
            this.brakeHiSource?.stop();
        }, 1200);
    }

    dispose() {
        this.engOsc1?.stop();
        this.engOsc2?.stop();
        this.engOsc3?.stop();
        this.tireSource?.stop();
        this.brakeLowSource?.stop();
        this.brakeMidSource?.stop();
        this.brakeHiSource?.stop();
        this.ctx?.close();
    }
}
