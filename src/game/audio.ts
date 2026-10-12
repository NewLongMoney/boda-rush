export type Sfx = {
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  muted: () => boolean;
  horn: () => void;
  coin: () => void;
  crash: () => void;
  fill: () => void;
  engine: (speed: number, running: boolean) => void;
  wanted: (on: boolean) => void;
  radio: (on: boolean, ducked: boolean) => void;
};

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let mute = false;
  let sirenOsc: OscillatorNode | null = null;
  let sirenGain: GainNode | null = null;
  let radioGain: GainNode | null = null;
  let nextStep = 0;
  let stepIndex = 0;

  function context() {
    if (!ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      osc = ctx.createOscillator();
      gain = ctx.createGain();
      filter = ctx.createBiquadFilter();
      osc.type = "sawtooth";
      osc.frequency.value = 48;
      gain.gain.value = 0;
      filter.type = "lowpass";
      filter.frequency.value = 420;
      osc.connect(gain);
      gain.connect(filter);
      filter.connect(ctx.destination);
      osc.start();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function beep(freq: number, dur: number, type: OscillatorType, vol: number) {
    if (mute) return;
    const ac = context();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur + 0.02);
  }

  function noise(dur: number, vol: number) {
    if (mute) return;
    const ac = context();
    const frames = Math.floor(ac.sampleRate * dur);
    const buffer = ac.createBuffer(1, frames, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const g = ac.createGain();
    g.gain.value = vol;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 600;
    src.connect(f);
    f.connect(g);
    g.connect(ac.destination);
    src.start();
  }

  return {
    unlock() {
      context();
    },
    setMuted(next: boolean) {
      mute = next;
      if (gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      if (sirenGain && ctx) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      if (radioGain && ctx) radioGain.gain.setTargetAtTime(next ? 0 : 0.2, ctx.currentTime, 0.05);
    },
    muted() {
      return mute;
    },
    horn() {
      beep(392, 0.14, "square", 0.06);
    },
    coin() {
      beep(660, 0.08, "sine", 0.07);
      window.setTimeout(() => beep(880, 0.12, "sine", 0.06), 70);
    },
    crash() {
      noise(0.22, 0.18);
      beep(90, 0.18, "triangle", 0.08);
    },
    fill() {
      beep(240, 0.1, "triangle", 0.05);
      window.setTimeout(() => beep(360, 0.14, "triangle", 0.05), 90);
    },
    engine(speed: number, running: boolean) {
      if (!ctx || !osc || !gain) return;
      const vol = mute || !running ? 0 : Math.min(0.045, 0.012 + Math.abs(speed) / 9000);
      const freq = 42 + Math.abs(speed) * 0.28;
      osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
      gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.08);
    },
    wanted(on: boolean) {
      if (!ctx) return;
      if (!sirenOsc || !sirenGain) {
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenOsc.type = "square";
        sirenOsc.frequency.value = 640;
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(ctx.destination);
        sirenOsc.start();
      }
      const vol = mute || !on ? 0 : 0.028;
      const wobble = 540 + (Math.sin(ctx.currentTime * 9) * 0.5 + 0.5) * 260;
      sirenOsc.frequency.setTargetAtTime(wobble, ctx.currentTime, 0.04);
      sirenGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.06);
    },
    radio(on: boolean, ducked: boolean) {
      if (!on || mute) {
        nextStep = 0;
        if (radioGain && ctx) radioGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        return;
      }
      const ac = context();
      if (!radioGain) {
        radioGain = ac.createGain();
        radioGain.gain.value = 0.2;
        radioGain.connect(ac.destination);
      }
      radioGain.gain.setTargetAtTime(ducked ? 0.07 : 0.2, ac.currentTime, 0.08);
      const step = 60 / 96 / 2;
      const now = ac.currentTime;
      if (nextStep < now) nextStep = now + 0.05;
      const kick = [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0];
      const snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
      const bass = [0, 0, 3, 0, 0, -2, 0, 3, 0, 0, 7, 3, 0, -2, 0, 5];
      while (nextStep < now + 0.16) {
        const i = stepIndex % 16;
        const t = nextStep;
        if (kick[i]) hit(ac, radioGain, 150, 48, t, 0.14, "sine", 0.55);
        if (snare[i]) hat(ac, radioGain, t, 0.1, 1600, 0.18);
        if (i % 2 === 1) hat(ac, radioGain, t, 0.035, 7200, 0.05);
        const freq = 55 * 2 ** ((bass[i] ?? 0) / 12);
        hit(ac, radioGain, freq, freq, t, 0.16, "triangle", 0.22);
        stepIndex += 1;
        nextStep += step;
      }
    },
  };
}

function hit(
  ac: AudioContext,
  dest: AudioNode,
  from: number,
  to: number,
  time: number,
  dur: number,
  type: OscillatorType,
  vol: number,
) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, from), time);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), time + dur);
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(g);
  g.connect(dest);
  o.start(time);
  o.stop(time + dur + 0.02);
}

function hat(ac: AudioContext, dest: AudioNode, time: number, dur: number, freq: number, vol: number) {
  const frames = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(time);
  src.stop(time + dur + 0.02);
}
