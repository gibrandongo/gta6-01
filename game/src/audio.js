// Synthesized sound only — every effect and the music loop are built with the
// Web Audio API. No audio files, no network. Audio starts on the first user
// gesture (browsers block it before then) and stays muted until then.

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let muted = false;
  let step = 0;

  // A warm late-afternoon chord loop: Am7 - Fmaj7 - Cmaj7 - G6, one chord a bar,
  // a soft bass under it and a sparse plucked melody on top.
  const CHORDS = [
    [220.0, 261.63, 329.63, 392.0],
    [174.61, 220.0, 261.63, 329.63],
    [196.0, 246.94, 293.66, 329.63],
    [164.81, 196.0, 246.94, 293.66],
  ];
  const MELODY = [440, 0, 523.25, 0, 659.25, 0, 587.33, 523.25, 0, 440, 0, 392, 0, 0, 0, 0];

  function ensure() {
    if (context) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 660;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      startMusic();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function note(freq, when, dur, type, gainValue, dest) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(gainValue, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function startMusic() {
    // One bar is 2.4 s; schedule a bar ahead, forever.
    const bar = 2.4;
    function scheduleBar() {
      if (!context) return;
      const chord = CHORDS[step % CHORDS.length];
      const t0 = context.currentTime + 0.05;
      for (let i = 0; i < chord.length; i += 1) {
        note(chord[i] / 2, t0, bar * 0.95, 'sine', 0.5, musicGain);
      }
      note(chord[0] / 4, t0, bar * 0.9, 'triangle', 0.7, musicGain);
      const m = MELODY[step % MELODY.length];
      if (m > 0) note(m, t0 + bar / 2, 0.5, 'sine', 0.35, musicGain);
      step += 1;
      musicTimer = window.setTimeout(scheduleBar, bar * 1000);
    }
    scheduleBar();
  }

  function burst(when, dur, freq, type, gainValue) {
    const size = Math.floor(context.sampleRate * dur);
    const buffer = context.createBuffer(1, size, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = context.createBufferSource();
    src.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(when);
  }

  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  return {
    unlock,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.55;
    },
    isMuted() {
      return muted;
    },
    /** Engine pitch follows speed 0..1; silent on foot. */
    engine(speed01, on) {
      if (!context) return;
      const target = on ? 0.05 + speed01 * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, context.currentTime, 0.1);
    },
    /** Two-tone siren while wanted; quiet otherwise. */
    siren(on, time) {
      if (!context) return;
      if (!on) {
        sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.2);
        return;
      }
      sirenGain.gain.setTargetAtTime(0.045, context.currentTime, 0.2);
      sirenOsc.frequency.setTargetAtTime(Math.sin(time * 5) > 0 ? 720 : 540, context.currentTime, 0.05);
    },
    shot() {
      if (!ensure()) return;
      burst(context.currentTime, 0.14, 900, 'square', 0.5);
    },
    hit() {
      if (!ensure()) return;
      burst(context.currentTime, 0.08, 2400, 'square', 0.3);
    },
    crash() {
      if (!ensure()) return;
      burst(context.currentTime, 0.3, 300, 'lowpass', 0.7);
    },
    pickup() {
      if (!ensure()) return;
      const t = context.currentTime;
      note(880, t, 0.12, 'sine', 0.4, master);
      note(1318.5, t + 0.09, 0.2, 'sine', 0.4, master);
    },
    coin() {
      if (!ensure()) return;
      const t = context.currentTime;
      note(1046.5, t, 0.1, 'sine', 0.35, master);
      note(1568, t + 0.07, 0.16, 'sine', 0.35, master);
    },
    mission() {
      if (!ensure()) return;
      const t = context.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, t + i * 0.11, 0.3, 'triangle', 0.4, master));
    },
    fail() {
      if (!ensure()) return;
      const t = context.currentTime;
      [392, 311.13, 261.63].forEach((f, i) => note(f, t + i * 0.14, 0.3, 'triangle', 0.35, master));
    },
    click() {
      if (!ensure()) return;
      note(660, context.currentTime, 0.06, 'sine', 0.25, master);
    },
    stop() {
      if (musicTimer !== null) window.clearTimeout(musicTimer);
      if (context) context.close().catch(() => {});
      context = null;
    },
  };
}
