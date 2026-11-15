// Sound from nothing: every effect is synthesised with the Web Audio API, so the game
// ships no audio files. The context wakes on the first click (the pointer-lock gesture),
// and a shot heard across the yard is the same call at a lower gain.
export function createAudio() {
  let ctx = null;
  let master = null;

  function wake() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }

  function noiseBuffer(seconds) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ at = 0, dur = 0.12, freq = 1800, gain = 0.5, type = 'lowpass', sweepTo = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(amp).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone({ at = 0, dur = 0.09, freq = 880, gain = 0.16, type = 'square', sweepTo = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const SHOTS = {
    pistol: { dur: 0.1, freq: 2400, gain: 0.4 },
    smg: { dur: 0.07, freq: 2600, gain: 0.3 },
    shotgun: { dur: 0.22, freq: 1200, gain: 0.65 },
    rifle: { dur: 0.11, freq: 2100, gain: 0.42 },
    dmr: { dur: 0.18, freq: 1500, gain: 0.55 },
  };

  return {
    wake,
    shot(kind, distance = 0) {
      const base = SHOTS[kind] || SHOTS.rifle;
      const fade = Math.max(0.06, 1 - distance / 55);
      burst({ dur: base.dur, freq: base.freq * (distance > 12 ? 0.55 : 1), gain: base.gain * fade, sweepTo: 220 });
      if (distance <= 12) burst({ dur: 0.05, freq: 3400, gain: 0.18 * fade, type: 'highpass' });
    },
    dryFire() {
      tone({ dur: 0.04, freq: 1400, gain: 0.1, type: 'square' });
    },
    reload() {
      tone({ dur: 0.05, freq: 500, gain: 0.12 });
      tone({ at: 0.16, dur: 0.05, freq: 750, gain: 0.12 });
      tone({ at: 0.34, dur: 0.06, freq: 620, gain: 0.14 });
    },
    hit(kill) {
      tone({ dur: 0.05, freq: kill ? 1560 : 1180, gain: 0.14, type: 'sine' });
      if (kill) tone({ at: 0.06, dur: 0.08, freq: 1980, gain: 0.12, type: 'sine' });
    },
    hurt() {
      burst({ dur: 0.09, freq: 500, gain: 0.22, sweepTo: 140 });
    },
    throwIt() {
      burst({ dur: 0.08, freq: 900, gain: 0.08, type: 'bandpass' });
    },
    explosion(distance = 0) {
      const fade = Math.max(0.15, 1 - distance / 60);
      burst({ dur: 0.7, freq: 900, gain: 0.8 * fade, sweepTo: 55 });
      burst({ dur: 0.25, freq: 2600, gain: 0.3 * fade });
    },
    beep(final = false) {
      tone({ dur: final ? 0.3 : 0.07, freq: final ? 1320 : 990, gain: 0.13, type: 'sine' });
    },
    buy() {
      tone({ dur: 0.05, freq: 1040, gain: 0.1 });
      tone({ at: 0.05, dur: 0.07, freq: 1560, gain: 0.1 });
    },
    denied() {
      tone({ dur: 0.09, freq: 220, gain: 0.12, type: 'sawtooth' });
    },
    roundWin() {
      tone({ dur: 0.11, freq: 660, gain: 0.13, type: 'triangle' });
      tone({ at: 0.11, dur: 0.11, freq: 880, gain: 0.13, type: 'triangle' });
      tone({ at: 0.22, dur: 0.2, freq: 1320, gain: 0.13, type: 'triangle' });
    },
    roundLose() {
      tone({ dur: 0.14, freq: 520, gain: 0.13, type: 'triangle' });
      tone({ at: 0.14, dur: 0.24, freq: 330, gain: 0.13, type: 'triangle' });
    },
  };
}
