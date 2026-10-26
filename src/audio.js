// Soundeffekte und Musik, komplett per Web Audio synthetisiert – keine Audiodateien nötig.

const SCALES = {
  dur: [0, 2, 4, 5, 7, 9, 11],
  dorisch: [0, 2, 3, 5, 7, 9, 10],
  phrygisch: [0, 1, 4, 5, 7, 8, 10], // phrygisch-dominant, klingt "orientalisch"
  mixolydisch: [0, 2, 4, 5, 7, 9, 10],
};
// Akkordfolgen als Stufen der Tonleiter (0 = Grundton).
const PROGRESSIONS = [[0, 4, 5, 3], [0, 3, 4, 0], [0, 5, 3, 4], [0, 6, 5, 4]];

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = { sfx: true, musik: true };
    this.volume = { sfx: 0.6, musik: 0.25 };
    this.music = null;
    this.lastPlayed = {};
  }

  // Muss nach einer Nutzeraktion aufgerufen werden (Browser-Autoplay-Regeln).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.volume.sfx;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.volume.musik;
      this.musicBus.connect(this.master);
      this.noiseBuf = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setEnabled(kind, on) {
    this.enabled[kind] = on;
    if (kind === 'musik' && this.music) this.musicBus.gain.value = on ? this.volume.musik : 0;
  }

  // ------------------------------------------------------------ Bausteine

  env(gainNode, t, a, d, peak) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + a);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(type, freq, t, a, d, peak, bus, freqEnd) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + a + d);
    this.env(g, t, a, d, peak);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + a + d + 0.05);
  }

  noise(t, dur, peak, filterType, freq, q, bus, freqEnd) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, 0.005, dur, peak);
    s.connect(f).connect(g).connect(bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ Effekte

  play(name, vol = 1) {
    if (!this.ctx || !this.enabled.sfx) return;
    // Gleicher Effekt höchstens alle 80 ms, sonst wird es Brei.
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed[name] || 0) < 0.08) return;
    this.lastPlayed[name] = now;
    const t = now + 0.01, b = this.sfxBus, v = vol;
    switch (name) {
      case 'hacken':
        this.noise(t, 0.08, 0.5 * v, 'bandpass', 900, 3, b);
        this.tone('triangle', 180, t, 0.002, 0.1, 0.3 * v, b, 90);
        break;
      case 'klopfen':
        this.tone('square', 1400, t, 0.001, 0.05, 0.15 * v, b, 900);
        this.noise(t, 0.04, 0.3 * v, 'highpass', 3000, 1, b);
        break;
      case 'amboss':
        this.tone('sine', 1800, t, 0.001, 0.4, 0.2 * v, b);
        this.tone('sine', 2700, t, 0.001, 0.25, 0.1 * v, b);
        this.noise(t, 0.03, 0.3 * v, 'highpass', 4000, 1, b);
        break;
      case 'saegen':
        for (let k = 0; k < 3; k++) this.noise(t + k * 0.18, 0.14, 0.25 * v, 'bandpass', 2500 + k * 300, 4, b, 1500);
        break;
      case 'graben':
        this.noise(t, 0.15, 0.35 * v, 'lowpass', 600, 1, b, 200);
        break;
      case 'sense':
        this.noise(t, 0.25, 0.25 * v, 'bandpass', 4000, 2, b, 1500);
        break;
      case 'platsch':
        this.noise(t, 0.3, 0.4 * v, 'lowpass', 1500, 2, b, 200);
        this.tone('sine', 600, t, 0.005, 0.15, 0.15 * v, b, 1200);
        break;
      case 'muehle':
        this.noise(t, 0.5, 0.2 * v, 'lowpass', 300, 3, b, 200);
        break;
      case 'ofen':
      case 'zischen':
        this.noise(t, 0.6, 0.2 * v, 'highpass', 2500, 1, b, 6000);
        break;
      case 'hammer':
        this.tone('square', 700, t, 0.001, 0.06, 0.12 * v, b, 300);
        this.noise(t, 0.05, 0.25 * v, 'bandpass', 1800, 2, b);
        break;
      case 'klirren':
        this.tone('sawtooth', 2200, t, 0.001, 0.2, 0.1 * v, b, 1700);
        this.tone('square', 3100, t + 0.02, 0.001, 0.15, 0.06 * v, b);
        this.noise(t, 0.08, 0.3 * v, 'highpass', 5000, 1, b);
        break;
      case 'plopp':
        this.tone('sine', 300, t, 0.005, 0.12, 0.35 * v, b, 700);
        break;
      case 'klick':
        this.tone('triangle', 900, t, 0.001, 0.04, 0.2 * v, b);
        break;
      case 'glocke':
        [523, 659, 784].forEach((f, k) => this.tone('sine', f, t + k * 0.09, 0.005, 0.6, 0.18 * v, b));
        break;
      case 'horn':
        this.tone('sawtooth', 147, t, 0.08, 0.9, 0.18 * v, b);
        this.tone('sawtooth', 220, t + 0.05, 0.08, 0.8, 0.12 * v, b);
        break;
      case 'fanfare':
        [523, 659, 784, 1047, 784, 1047].forEach((f, k) => this.tone('square', f, t + k * 0.15, 0.01, k === 5 ? 0.9 : 0.14, 0.12 * v, b));
        break;
      case 'trauer':
        [392, 349, 311, 262].forEach((f, k) => this.tone('triangle', f, t + k * 0.35, 0.02, 0.45, 0.2 * v, b));
        break;
      case 'tod':
        this.tone('sawtooth', 400, t, 0.01, 0.4, 0.1 * v, b, 80);
        break;
      case 'feuer':
        this.noise(t, 1.2, 0.3 * v, 'lowpass', 900, 0.5, b, 300);
        break;
      case 'einzug':
        this.tone('sine', 660, t, 0.005, 0.1, 0.15 * v, b);
        this.tone('sine', 880, t + 0.08, 0.005, 0.15, 0.15 * v, b);
        break;
    }
  }

  // ------------------------------------------------------------ Musik

  startMusic(faction) {
    if (!this.ctx) return;
    this.stopMusic();
    const fx = faction;
    const scale = SCALES[fx.scale] || SCALES.dur;
    const root = { dur: 60, dorisch: 57, phrygisch: 62, mixolydisch: 55 }[fx.scale] || 60;
    const bpm = { dur: 96, dorisch: 84, phrygisch: 90, mixolydisch: 104 }[fx.scale] || 96;
    const beat = 60 / bpm;
    const prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const note = (deg, oct = 0) => {
      const o = Math.floor(deg / 7);
      return root + scale[((deg % 7) + 7) % 7] + 12 * (o + oct);
    };
    const state = { next: this.ctx.currentTime + 0.1, step: 0, mel: 4, timer: null };
    const tick = () => {
      if (!this.ctx) return;
      while (state.next < this.ctx.currentTime + 0.4) {
        const t = state.next;
        const bar = Math.floor(state.step / 8) % prog.length;
        const chord = prog[bar];
        const s8 = state.step % 8;
        const b = this.musicBus;
        if (s8 === 0) {
          // Bass und weicher Akkord
          this.tone('sine', midi(note(chord, -2)), t, 0.02, beat * 3.5, 0.35, b);
          for (const k of [0, 2, 4]) this.tone('triangle', midi(note(chord + k, -1)), t, 0.3, beat * 3.6, 0.05, b);
        }
        if (s8 === 4) this.tone('sine', midi(note(chord + 4, -2)), t, 0.02, beat * 1.8, 0.25, b);
        // Melodie: Zufallsweg auf der Tonleiter, zieht zu Akkordtönen.
        if (Math.random() < 0.62) {
          state.mel += Math.floor(Math.random() * 5) - 2;
          if (s8 % 4 === 0) state.mel = chord + [0, 2, 4][Math.floor(Math.random() * 3)] + 7;
          state.mel = Math.max(3, Math.min(14, state.mel));
          this.tone('triangle', midi(note(state.mel)), t, 0.01, beat * 0.9, 0.12, b);
          if (fx.scale === 'phrygisch' || fx.scale === 'dorisch') this.tone('sine', midi(note(state.mel) + 12), t, 0.01, beat * 0.4, 0.03, b);
        }
        // Trommel
        if (fx.drum > 0 && (s8 === 0 || s8 === 4 || (s8 === 6 && Math.random() < 0.5))) {
          this.tone('sine', s8 === 0 ? 110 : 140, t, 0.002, 0.18, 0.4 * fx.drum, b, 50);
        }
        if (s8 % 2 === 1 && Math.random() < 0.5) this.noise(t, 0.03, 0.06, 'highpass', 6000, 1, b);
        state.step++;
        state.next += beat / 2;
      }
    };
    state.timer = setInterval(tick, 100);
    tick();
    this.music = state;
    this.musicBus.gain.value = this.enabled.musik ? this.volume.musik : 0;
  }

  stopMusic() {
    if (this.music) clearInterval(this.music.timer);
    this.music = null;
  }
}
