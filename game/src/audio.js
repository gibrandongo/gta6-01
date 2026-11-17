// All sound in Solmar Bay is synthesised live with WebAudio — no audio files, no network.
// Engine hum, gunshots, sirens, pickups, phone rings and a lazy sun-soaked music loop.

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(master);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineOsc.start();
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenGain.connect(master);
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenOsc.connect(sirenGain);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume();
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, context.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + dur);
      gain.gain.setValueAtTime(vol || 0.2, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(context.currentTime + dur + 0.02);
    } catch {
      // Sound is garnish; a failure never breaks the game.
    }
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    try {
      const len = Math.max(1, Math.floor(context.sampleRate * dur));
      const buffer = context.createBuffer(1, len, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = context.createBufferSource();
      src.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = context.createGain();
      gain.gain.value = vol || 0.3;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // Ignore.
    }
  }

  // A lazy two-chord groove: Am7 to Fmaj7, one plucked note per step.
  const MUSIC_NOTES = [220, 261.63, 329.63, 392, 440, 349.23, 293.66, 329.63];
  const MUSIC_BASS = [110, 110, 87.31, 87.31, 110, 110, 87.31, 87.31];

  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = setInterval(() => {
      if (muted || !context || context.state !== 'running') return;
      const step = musicStep % 8;
      const note = MUSIC_NOTES[step];
      const bass = MUSIC_BASS[step];
      try {
        const t = context.currentTime;
        const osc = context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = note;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(t);
        osc.stop(t + 0.45);
        if (step % 2 === 0) {
          const bosc = context.createOscillator();
          bosc.type = 'sine';
          bosc.frequency.value = bass;
          const bgain = context.createGain();
          bgain.gain.setValueAtTime(0.0001, t);
          bgain.gain.exponentialRampToValueAtTime(0.6, t + 0.03);
          bgain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
          bosc.connect(bgain);
          bgain.connect(musicGain);
          bosc.start(t);
          bosc.stop(t + 0.85);
        }
      } catch {
        // Ignore.
      }
      musicStep += 1;
    }, 340);
  }

  function setEngine(speedFrac, driving) {
    if (!context) return;
    const target = driving ? 0.05 + speedFrac * 0.09 : 0;
    engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(55 + speedFrac * 160, context.currentTime, 0.08);
  }

  function setSiren(on) {
    if (!context) return;
    sirenGain.gain.setTargetAtTime(on && !muted ? 0.045 : 0, context.currentTime, 0.2);
    if (on) {
      const now = context.currentTime;
      sirenOsc.frequency.cancelScheduledValues(now);
      sirenOsc.frequency.setValueAtTime(660, now);
      sirenOsc.frequency.linearRampToValueAtTime(920, now + 0.55);
      sirenOsc.frequency.linearRampToValueAtTime(660, now + 1.1);
    }
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  return {
    unlock,
    startMusic,
    setEngine,
    setSiren,
    toggleMute,
    isMuted() { return muted; },
    shoot() { noise(0.14, 0.5, 2400); tone(180, 0.08, 'square', 0.12, 60); },
    explosion() { noise(0.7, 0.6, 500); tone(70, 0.6, 'sine', 0.35, 30); },
    crash() { noise(0.25, 0.35, 700); },
    pickup() { tone(660, 0.09, 'sine', 0.2); setTimeout(() => tone(990, 0.14, 'sine', 0.2), 90); },
    cash() { tone(880, 0.08, 'triangle', 0.2); setTimeout(() => tone(1174, 0.1, 'triangle', 0.2), 80); setTimeout(() => tone(1568, 0.18, 'triangle', 0.2), 170); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.22), i * 120)); },
    phone() { tone(1200, 0.12, 'sine', 0.18); setTimeout(() => tone(1200, 0.12, 'sine', 0.18), 220); },
    horn() { tone(370, 0.25, 'square', 0.12); tone(466, 0.25, 'square', 0.1); },
    hit() { tone(220, 0.1, 'sawtooth', 0.18, 110); },
    busted() { tone(440, 0.3, 'sawtooth', 0.2, 220); setTimeout(() => tone(330, 0.5, 'sawtooth', 0.2, 165), 300); },
  };
}
