// Web Audio API alert — no external files required

let _ctx = null;

const getCtx = () => {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume context if it was suspended by browser autoplay policy
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
};

/**
 * Plays a short two-tone notification (pleasant, not jarring).
 * Safe to call repeatedly — each call is independent.
 */
export const playAlert = () => {
  try {
    const ctx  = getCtx();
    const now  = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    const tones = [880, 1100];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);

      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

      osc.start(start);
      osc.stop(start + 0.32);
    });
  } catch {
    // Silently ignore — audio is non-critical
  }
};

/**
 * Unlocks AudioContext on first user gesture.
 * Call this from a click handler early in the app lifecycle.
 */
export const unlockAudio = () => {
  try { getCtx(); } catch { /* noop */ }
};
