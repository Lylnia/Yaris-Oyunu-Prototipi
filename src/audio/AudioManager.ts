import { clamp } from '../utils/MathUtils';

/**
 * Simple audio manager using Web Audio API.
 * Generates engine and tire sounds procedurally (no assets needed).
 */
export class AudioManager {
    private ctx: AudioContext | null = null;
    private engineOsc: OscillatorNode | null = null;
    private engineGain: GainNode | null = null;
    private tireNoise: AudioBufferSourceNode | null = null;
    private tireGain: GainNode | null = null;
    private started = false;

    /** Call once on first user interaction */
    init() {
        if (this.started) return;
        this.ctx = new AudioContext();
        this.started = true;

        // ── Engine: sawtooth oscillator ──
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 80;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;

        // Low-pass for warmth
        const lpf = this.ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.value = 600;

        this.engineOsc.connect(lpf);
        lpf.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start();

        // ── Tire screech: filtered noise ──
        const noiseLen = this.ctx.sampleRate * 2;
        const noiseBuf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;

        this.tireNoise = this.ctx.createBufferSource();
        this.tireNoise.buffer = noiseBuf;
        this.tireNoise.loop = true;

        const tireBpf = this.ctx.createBiquadFilter();
        tireBpf.type = 'bandpass';
        tireBpf.frequency.value = 3000;
        tireBpf.Q.value = 2;

        this.tireGain = this.ctx.createGain();
        this.tireGain.gain.value = 0;

        this.tireNoise.connect(tireBpf);
        tireBpf.connect(this.tireGain);
        this.tireGain.connect(this.ctx.destination);
        this.tireNoise.start();
    }

    /** Update every frame */
    update(rpm: number, isDrifting: boolean, driftAngle: number, braking: number) {
        if (!this.ctx || !this.engineOsc || !this.engineGain || !this.tireGain) return;

        // Engine pitch: 80 Hz idle → 350 Hz at max RPM
        const freq = 80 + rpm * 270;
        this.engineOsc.frequency.linearRampToValueAtTime(freq, this.ctx.currentTime + 0.05);
        this.engineGain.gain.linearRampToValueAtTime(0.06 + rpm * 0.08, this.ctx.currentTime + 0.05);

        // Tire volume based on drift + brake
        const tireVol = clamp(
            (isDrifting ? Math.abs(driftAngle) * 1.5 : 0) + braking * 0.15,
            0, 0.25
        );
        this.tireGain.gain.linearRampToValueAtTime(tireVol, this.ctx.currentTime + 0.05);
    }

    dispose() {
        this.engineOsc?.stop();
        this.tireNoise?.stop();
        this.ctx?.close();
    }
}
