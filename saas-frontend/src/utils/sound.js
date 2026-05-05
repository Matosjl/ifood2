// Web Audio API — no external files required

let _ctx = null;

const getCtx = () => {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
};

/**
 * Plays a pleasant restaurant-style doorbell / ding-dong.
 * 3 ascending notes — clearly audible without being jarring.
 */
export const playAlert = () => {
  try {
    const ctx  = getCtx();
    const now  = ctx.currentTime;

    // Master gain
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.35, now);
    master.connect(ctx.destination);

    // Three notes: ding-dong-ding
    const notes = [
      { freq: 1047, start: 0,    dur: 0.45 },  // C6
      { freq:  880, start: 0.22, dur: 0.45 },  // A5
      { freq: 1319, start: 0.44, dur: 0.55 },  // E6
    ];

    notes.forEach(({ freq, start, dur }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + start);
      // slight vibrato
      osc.frequency.linearRampToValueAtTime(freq * 0.995, now + start + dur * 0.6);

      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.9,   now + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    });
  } catch {
    // Silently ignore — audio is non-critical
  }
};

/**
 * Short single "pip" for minor events (status change, etc.)
 */
export const playPip = () => {
  try {
    const ctx  = getCtx();
    const now  = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch { /* noop */ }
};

/**
 * Unlocks AudioContext on first user gesture.
 * Call this from a click handler early in the app lifecycle.
 */
export const unlockAudio = () => {
  try { getCtx(); } catch { /* noop */ }
};
