import { SkinTheme } from './types';
import { BUILTIN_SKINS } from './skins';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class LuminesAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted = false;
  private isPlaying = false;
  private skin: SkinTheme = BUILTIN_SKINS[0];
  private bpm = 116;

  private stepIndex = 0;
  private nextStepTime = 0;
  private schedulerTimer: number | null = null;
  private beatPulseLevel = 0;
  private lastBeatTimestamp = 0;

  private hasUserActivation(): boolean {
    if (typeof navigator === 'undefined') return false;
    if ('userActivation' in navigator) {
      return Boolean(
        (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation
          ?.hasBeenActive
      );
    }
    return true;
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined' || !this.hasUserActivation()) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.32;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setSkinAndBpm(skin: SkinTheme, bpm: number): void {
    this.skin = skin;
    this.bpm = Math.max(80, Math.min(190, bpm));
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.32, this.ctx.currentTime, 0.02);
    }
    return this.isMuted;
  }

  public startLoop(): void {
    this.isPlaying = true;
    const ctx = this.initContext();
    if (ctx) {
      this.stepIndex = 0;
      this.nextStepTime = ctx.currentTime + 0.04;
    }

    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
    }
    this.schedulerTimer = window.setInterval(() => this.scheduleSteps(), 25);
  }

  public stopLoop(): void {
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  /**
   * Returns a 0..1 envelope representing the current kick/quarter-note pulse for reactive visuals.
   */
  public getBeatPulse(nowMs: number): number {
    if (!this.ctx) {
      // Fallback visual beat clock when AudioContext awaits first gesture
      const beatMs = (60 / this.bpm) * 1000;
      const phase = (nowMs % beatMs) / beatMs;
      return Math.exp(-phase * 3.2);
    }
    const elapsed = Math.max(0, nowMs - this.lastBeatTimestamp);
    const beatMs = (60 / this.bpm) * 1000;
    const decay = Math.exp(-elapsed / (beatMs * 0.35));
    return Math.min(1, decay * this.beatPulseLevel);
  }

  private scheduleSteps(): void {
    if (!this.isPlaying) return;
    if (!this.ctx) {
      const ctx = this.initContext();
      if (!ctx) return;
      this.stepIndex = 0;
      this.nextStepTime = ctx.currentTime + 0.04;
    }
    if (!this.ctx || !this.masterGain) return;
    const lookahead = 0.1;
    const secondsPerBeat = 60 / this.bpm;
    const sixteenthDur = secondsPerBeat / 4;

    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      this.triggerStep(this.stepIndex, this.nextStepTime, sixteenthDur);
      this.nextStepTime += sixteenthDur;
      this.stepIndex = (this.stepIndex + 1) % 16;
    }
  }

  private triggerStep(step: number, time: number, stepDur: number): void {
    if (!this.ctx || !this.masterGain) return;

    // Kick on every quarter note (steps 0, 4, 8, 12) + subtle syncopated ghost kick on 14
    if (step % 4 === 0 || step === 14) {
      const isGhost = step === 14;
      this.playKick(time, isGhost ? 0.35 : 0.85);
      if (!isGhost) {
        this.lastBeatTimestamp = performance.now();
        this.beatPulseLevel = 1.0;
      }
    }

    // Crisp offbeat open hat on steps 2, 6, 10, 14 and closed ticks on odd 16ths
    if (step % 4 === 2) {
      this.playHiHat(time, 0.09, 0.18);
    } else if (step % 2 === 1) {
      this.playHiHat(time, 0.03, 0.07);
    }

    // Snare / Electronic Clap on beats 2 and 4 (steps 4, 12)
    if (step === 4 || step === 12) {
      this.playClap(time, 0.24);
    }

    // Rolling off-beat bassline (steps 1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15)
    if (step % 2 === 1 || step % 4 === 2) {
      const patIdx = Math.floor(step / 2) % this.skin.bassPattern.length;
      const interval = this.skin.bassPattern[patIdx];
      const bassMidi = this.skin.rootMidi - 12 + interval;
      this.playBassNote(time, midiToFreq(bassMidi), stepDur * 0.85, step % 4 === 2 ? 0.24 : 0.14);
    }

    // Shimmering 16th-note arpeggio
    const arpInterval = this.skin.arpPattern[step % this.skin.arpPattern.length];
    const arpMidi = this.skin.rootMidi + arpInterval + (step >= 8 ? 12 : 0);
    this.playSynthPluck(time, midiToFreq(arpMidi), stepDur * 1.2, 0.08, 'triangle');
  }

  private playKick(time: number, amp: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(138, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);
    osc.frequency.exponentialRampToValueAtTime(28, time + 0.22);

    gain.gain.setValueAtTime(amp, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  private playHiHat(time: number, duration: number, amp: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    // Metallic FM square pair for crisp zero-allocation hi-hat
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'square';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(6400, time);
    osc2.frequency.setValueAtTime(9120, time);

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    gain.gain.setValueAtTime(amp, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.01);
    osc2.stop(time + duration + 0.01);
  }

  private playClap(time: number, amp: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, time);
    osc.frequency.exponentialRampToValueAtTime(95, time + 0.08);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, time);

    gain.gain.setValueAtTime(amp, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  private playBassNote(time: number, freq: number, dur: number, amp: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.5, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.4, time + dur);

    gain.gain.setValueAtTime(amp, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playSynthPluck(
    time: number,
    freq: number,
    dur: number,
    amp: number,
    type: OscillatorType = 'triangle'
  ): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playMeowChirp(time: number, baseFreq: number, dur = 0.24, amp = 0.16): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    // Sweet vocal formant curve: glides up a musical third ("m-eee") then settles down ("-ow!")
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * 0.88, time);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.28, time + dur * 0.36);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.94, time + dur);

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(baseFreq * 1.76, time);
    subOsc.frequency.exponentialRampToValueAtTime(baseFreq * 2.56, time + dur * 0.36);
    subOsc.frequency.exponentialRampToValueAtTime(baseFreq * 1.88, time + dur);

    filter.type = 'bandpass';
    filter.Q.setValueAtTime(3.2, time);
    filter.frequency.setValueAtTime(baseFreq * 1.5, time);
    filter.frequency.exponentialRampToValueAtTime(baseFreq * 2.6, time + dur * 0.4);
    filter.frequency.exponentialRampToValueAtTime(baseFreq * 1.3, time + dur);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(amp, time + dur * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    subOsc.start(time);
    osc.stop(time + dur + 0.02);
    subOsc.stop(time + dur + 0.02);
  }

  /**
   * Plays quantized melodic SFX harmonized to the current skin's musical scale!
   */
  public playActionSfx(
    action:
      | 'move'
      | 'rotateCW'
      | 'rotateCCW'
      | 'hardDrop'
      | 'squareLock'
      | 'sweepClear'
      | 'skinChange'
      | 'gameOver'
      | 'meow',
    intensity = 1
  ): void {
    const ctx = this.initContext();
    if (!ctx || !this.masterGain || this.isMuted) return;
    const now = ctx.currentTime;
    const scale = this.skin.scaleIntervals;
    const root = this.skin.rootMidi;

    if (action === 'move') {
      const note = root + scale[(this.stepIndex + 1) % scale.length] + 12;
      this.playSynthPluck(now, midiToFreq(note), 0.065, 0.11, 'sine');
    } else if (action === 'rotateCW' || action === 'rotateCCW') {
      const idx = action === 'rotateCW' ? 4 : 2;
      const n1 = root + scale[idx % scale.length] + 12;
      const n2 = root + scale[(idx + 2) % scale.length] + 12;
      this.playSynthPluck(now, midiToFreq(n1), 0.08, 0.15, 'triangle');
      this.playSynthPluck(now + 0.035, midiToFreq(n2), 0.11, 0.16, 'triangle');
    } else if (action === 'hardDrop') {
      const n = root + scale[0];
      this.playBassNote(now, midiToFreq(n), 0.15, 0.26);
      this.playSynthPluck(now, midiToFreq(n + 12), 0.12, 0.18, 'sawtooth');
    } else if (action === 'squareLock') {
      // Shimmering 2-note fifth interval + adorable kitten mew when a 2x2 square locks in
      const base = root + scale[Math.min(scale.length - 1, intensity % scale.length)] + 12;
      this.playSynthPluck(now, midiToFreq(base), 0.18, 0.2, 'triangle');
      this.playSynthPluck(now + 0.04, midiToFreq(base + 7), 0.24, 0.22, 'sine');
      this.playMeowChirp(now + 0.03, midiToFreq(base + 12), 0.19, 0.12);
    } else if (action === 'sweepClear') {
      // Euphoric ascending arpeggiated chord scaled by combo + joyful dual kitten chorus
      const chordIndices = [0, 2, 4, 6, 7];
      const octaveBoost = Math.min(12, Math.floor(intensity / 3) * 12);
      chordIndices.forEach((cIdx, i) => {
        const midi = root + scale[cIdx % scale.length] + 12 + octaveBoost;
        this.playSynthPluck(now + i * 0.038, midiToFreq(midi), 0.35, 0.22, 'triangle');
      });
      const meowMidi = root + scale[(intensity + 2) % scale.length] + 24;
      this.playMeowChirp(now + 0.08, midiToFreq(meowMidi), 0.24, 0.15);
    } else if (action === 'meow') {
      // Interactive kitten petted chirp: double joyful harmonic mew!
      const n1 = root + scale[intensity % scale.length] + 24;
      const n2 = root + scale[(intensity + 2) % scale.length] + 24;
      this.playMeowChirp(now, midiToFreq(n1), 0.22, 0.18);
      this.playMeowChirp(now + 0.12, midiToFreq(n2), 0.26, 0.16);
    } else if (action === 'skinChange') {
      [0, 4, 7, 12, 16].forEach((semi, i) => {
        this.playSynthPluck(now + i * 0.055, midiToFreq(root + semi + 12), 0.45, 0.24, 'sawtooth');
      });
    } else if (action === 'gameOver') {
      [12, 10, 7, 3, 0].forEach((semi, i) => {
        this.playSynthPluck(now + i * 0.08, midiToFreq(root + semi), 0.4, 0.22, 'sawtooth');
      });
    }
  }
}

export const audioEngine = new LuminesAudioEngine();
