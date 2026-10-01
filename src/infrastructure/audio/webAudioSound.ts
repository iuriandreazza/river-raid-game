import type { SoundPort } from '../../application/ports.ts';
import { LOW_FUEL_THRESHOLD } from '../../domain/constants.ts';
import type { GameEvent, GameState, SpeedLevel } from '../../domain/types.ts';

const MASTER_VOLUME = 0.25;
/** The drone rises with the scroll speed, as in the original. */
const ENGINE_HZ: Record<SpeedLevel, number> = { slow: 46, normal: 58, fast: 82 };
const ENGINE_VOLUME = 0.32;
const SIREN_VOLUME = 0.1;
const REFUEL_VOLUME = 0.12;
/** The refuel bell jumps up a fifth when the tank is full. */
const REFUEL_HZ = 523;
const TANK_FULL_HZ = 784;
const SMOOTHING_SECONDS = 0.03;
const EXTRA_JET_NOTES = [523, 659, 784, 1047];

/** Every sound is synthesized, so the game ships without a single audio file. */
export class WebAudioSound implements SoundPort {
  private readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  // Declared before the continuous sounds, which register themselves here as they start.
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly engine = this.createEngine();
  private readonly siren = this.createSiren();
  private readonly refuel = this.createRefuelBell();
  private readonly noise = this.createNoise();

  constructor() {
    this.master.gain.value = MASTER_VOLUME;
    this.master.connect(this.context.destination);
    void this.context.resume();
  }

  play(event: GameEvent): void {
    switch (event.type) {
      case 'missileFired':
        this.tone('square', 1400, 250, 0.11, 0.18);
        return;
      case 'objectDestroyed':
        this.noiseBurst(0.25, 0.5, 3200, 300);
        return;
      case 'bridgeDestroyed':
        this.noiseBurst(0.8, 0.8, 2400, 80);
        this.tone('sine', 110, 35, 0.7, 0.6);
        return;
      case 'jetLost':
        this.noiseBurst(1, 0.8, 2000, 100);
        this.tone('sawtooth', 220, 40, 0.9, 0.3);
        return;
      case 'extraJet':
        EXTRA_JET_NOTES.forEach((hz, index) => this.tone('square', hz, hz, 0.09, 0.16, index * 0.09));
        return;
      case 'respawned':
        this.tone('triangle', 330, 660, 0.15, 0.15);
        return;
      case 'gameOver':
        this.tone('sawtooth', 440, 80, 1.2, 0.3);
        return;
    }
  }

  sync(state: GameState): void {
    const flying = state.phase === 'playing';
    this.ramp(this.engine.gain.gain, flying ? ENGINE_VOLUME : 0);
    this.engine.pitch.forEach((oscillator, index) =>
      this.ramp(oscillator.frequency, ENGINE_HZ[state.speedLevel] / (index === 0 ? 1 : 2)),
    );
    this.ramp(this.siren.gain.gain, flying && state.fuel < LOW_FUEL_THRESHOLD ? SIREN_VOLUME : 0);
    this.ramp(this.refuel.gain.gain, flying && state.refueling ? REFUEL_VOLUME : 0);
    this.ramp(this.refuel.oscillator.frequency, state.fuel >= 0.999 ? TANK_FULL_HZ : REFUEL_HZ);
  }

  setPaused(paused: boolean): void {
    void (paused ? this.context.suspend() : this.context.resume());
  }

  setMuted(muted: boolean): void {
    this.ramp(this.master.gain, muted ? 0 : MASTER_VOLUME);
  }

  dispose(): void {
    for (const source of this.sources) source.stop();
    void this.context.close();
  }

  private createEngine(): { gain: GainNode; pitch: OscillatorNode[] } {
    const gain = this.context.createGain();
    gain.gain.value = 0;
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 420;
    lowpass.connect(gain);
    gain.connect(this.master);

    const pitch = (['sawtooth', 'square'] as const).map((type) => {
      const oscillator = this.start(this.context.createOscillator());
      oscillator.type = type;
      oscillator.frequency.value = ENGINE_HZ.normal;
      oscillator.connect(lowpass);
      return oscillator;
    });
    return { gain, pitch };
  }

  /** A square wave whose pitch is flipped by a slow square LFO: the classic two-tone alarm. */
  private createSiren(): { gain: GainNode } {
    const gain = this.context.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);

    const oscillator = this.start(this.context.createOscillator());
    oscillator.type = 'square';
    oscillator.frequency.value = 760;
    oscillator.connect(gain);

    const lfo = this.start(this.context.createOscillator());
    lfo.type = 'square';
    lfo.frequency.value = 3;
    const depth = this.context.createGain();
    depth.gain.value = 140;
    lfo.connect(depth);
    depth.connect(oscillator.frequency);
    return { gain };
  }

  private createRefuelBell(): { gain: GainNode; oscillator: OscillatorNode } {
    const gain = this.context.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const oscillator = this.start(this.context.createOscillator());
    oscillator.type = 'triangle';
    oscillator.frequency.value = REFUEL_HZ;
    oscillator.connect(gain);
    return { gain, oscillator };
  }

  private createNoise(): AudioBuffer {
    const buffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private start<T extends AudioScheduledSourceNode>(source: T): T {
    source.start();
    this.sources.push(source);
    return source;
  }

  private ramp(param: AudioParam, value: number): void {
    param.setTargetAtTime(value, this.context.currentTime, SMOOTHING_SECONDS);
  }

  private tone(type: OscillatorType, fromHz: number, toHz: number, seconds: number, volume: number, delay = 0): void {
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromHz, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, toHz), start + seconds);
    this.fadeOut(oscillator, volume, start, seconds);
    oscillator.start(start);
    oscillator.stop(start + seconds);
  }

  private noiseBurst(seconds: number, volume: number, fromHz: number, toHz: number): void {
    const start = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(fromHz, start);
    lowpass.frequency.exponentialRampToValueAtTime(toHz, start + seconds);
    source.connect(lowpass);
    this.fadeOut(lowpass, volume, start, seconds);
    source.start(start);
    source.stop(start + seconds);
  }

  /** Routes a source to the speakers through an envelope that starts at `volume` and dies out. */
  private fadeOut(source: AudioNode, volume: number, start: number, seconds: number): void {
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(volume, start);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(envelope);
    envelope.connect(this.master);
  }
}
