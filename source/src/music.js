// Music: an original heroic chiptune for Tancredi's Castle, synthesised with the Web Audio API, no audio files. Four
// voices as on an old sound chip: a pulse-wave fanfare, a square-wave arpeggio, a galloping triangle bass and a noise
// shimmer, through a low-pass and an echo. A minor, 112 beats a minute, 32 bars: a call (i VI VII i), its answer
// climbing higher, a darker turn (iv VII) and back. Written for this city, it quotes no existing music.
// Nothing runs per frame. The audio graph is built once, on the first click, tap or key (browsers allow sound only
// after one), and each voice is one oscillator that plays for ever. A timer four times a second writes the next notes
// as gain and pitch automation on the audio clock, 1.5 s ahead, at times computed from the loop count, so no node is
// created after the start, the loop point is just the next note and nothing drifts. M mutes (remembered); muted or
// with the tab hidden the audio clock is suspended and the timer stopped.
{
  // tempo, key and loudness: the numbers to change
  const BPM = 112;                       // beats a minute; the notes and the echo follow
  const ROOT = 57;                       // the key's tonic as a MIDI note (57 = A3)
  const SCALE = [0, 2, 3, 5, 7, 8, 10];  // natural minor: the pattern is in scale steps
  const VOLUME = 0.3;                    // master gain, 0-1
  const CUTOFF = 3400;                   // the low-pass, Hz: lower is softer
  const ECHO = [0.75, 0.22, 0.22];       // echo: delay in beats (a dotted eighth), feedback, level
  const LEVEL = [0.12, 0.07, 0.3, 0.04]; // melody, arpeggio, bass, shimmer

  // the pattern, on a grid of eighth notes (8 a bar). Chords are scale steps, one a bar, the 16 bars played twice
  const CHORDS = [0, 0, 5, 5, 6, 6, 0, 0, 0, 0, 5, 5, 3, 3, 6, 6]; // i i VI VI VII VII i i, i i VI VI iv iv VII VII
  const ARP = [[0, 2, 4, 2, 0, 2, 4, 7], [7, 4, 2, 4, 7, 4, 2, 4]]; // steps above the chord, bars 1-16 and 17-32
  // melody: start (eighths from the loop's start), scale step above ROOT + 12, length (eighths); one note at a time
  const THEME = [
    0, 0, 2, 2, 0, 1, 3, 0, 1, 4, 4, 4, 8, 2, 3, 11, 4, 1, 12, 7, 4, 16, 5, 6, 22, 4, 2, 24, 5, 2, 26, 7, 2, 28, 9, 4,
    32, 8, 3, 35, 7, 1, 36, 6, 4, 40, 8, 2, 42, 10, 2, 44, 8, 4, 48, 7, 6, 54, 6, 2, 56, 7, 8,
    64, 0, 2, 66, 0, 1, 67, 0, 1, 68, 4, 4, 72, 7, 3, 75, 8, 1, 76, 9, 4, 80, 10, 4, 84, 9, 2, 86, 7, 2, 88, 9, 6, 94, 7, 2,
    96, 10, 4, 100, 9, 2, 102, 8, 2, 104, 7, 6, 110, 5, 2, 112, 6, 4, 116, 8, 4, 120, 10, 6, 126, 11, 2,
  ];
  // played twice; the second time the arpeggio runs downwards (ARP) under it
  const MELODY = [...THEME, ...THEME.map((v, i) => (i % 3 === 0 ? v + 128 : v))];
  const BARS = 32, LOOP = BARS * 8, STEP = 30 / BPM, AHEAD = 1.5;

  // every note of the loop, sorted by time: [eighth, voice (0 melody, 1 arpeggio, 2 bass, 3 shimmer), MIDI note, eighths, level]
  const deg = (d) => SCALE[d % SCALE.length] + 12 * Math.floor(d / SCALE.length);
  const ev = [];
  for (let i = 0; i < MELODY.length; i += 3) ev.push([MELODY[i], 0, ROOT + 12 + deg(MELODY[i + 1]), MELODY[i + 2], LEVEL[0]]);
  for (let b = 0; b < BARS; b++) {
    const c = CHORDS[b % 16], lo = c >= 4 ? c - SCALE.length : c, s = b * 8; // high chords' arpeggios an octave down
    for (let k = 0; k < 8; k++) ev.push([s + k, 1, ROOT + deg(lo + SCALE.length + ARP[b >> 4][k]) - 12, 1, LEVEL[1] * (k ? k < 4 ? 0.8 : 0.65 : 1)]);
    // bass: a gallop on the chord's root (dum da-da), the fifth on the last beat of every second bar
    for (const k of [0, 2, 3, 4, 6, 7]) { const fifth = b % 2 === 1 && k >= 6, d = c + (fifth ? 4 : 0); ev.push([s + k, 2, ROOT - 24 + deg(d) - (d >= SCALE.length ? 12 : 0), 1, LEVEL[2] * (k === 0 || k === 4 ? 1 : 0.7)]); }
    if (b % 2 === 0) ev.push([s, 3, 0, 16, LEVEL[3] * (b % 4 ? 0.6 : 1)]); // shimmer: a swell every two bars
  }
  ev.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const NE = ev.length, ES = new Int16Array(NE), EV = new Uint8Array(NE), EL = new Uint8Array(NE), EF = new Float32Array(NE), EA = new Float32Array(NE);
  ev.forEach((e, i) => { ES[i] = e[0]; EV[i] = e[1]; EF[i] = 440 * 2 ** ((e[2] - 69) / 12); EL[i] = e[3]; EA[i] = e[4]; });

  let ctx = null, out, osc, amp, vib, timer = 0, off = 0, t0 = 0, n = 0, i = 0, muted = false;
  try { muted = localStorage.atlantisMute === '1'; } catch {}

  // one note: pitch set while the voice is silent (every envelope ends at zero before the next note starts), then
  // straight-line envelopes inside the note's own span, so no two notes' automation interleave and nothing clicks
  const play = (k, t) => {
    const v = EV[k], d = EL[k] * STEP, a = EA[k], g = amp[v].gain;
    if (v < 3) osc[v].frequency.setValueAtTime(EF[k], t);
    g.setValueAtTime(0, t);
    if (v === 1) { // arpeggio: a pluck
      g.linearRampToValueAtTime(a, t + 0.005); g.linearRampToValueAtTime(a * 0.4, t + 0.08);
      g.linearRampToValueAtTime(a * 0.12, t + d * 0.6); g.linearRampToValueAtTime(0, t + d * 0.95);
    } else if (v === 3) { // shimmer: a slow swell
      g.linearRampToValueAtTime(a, t + d * 0.5); g.linearRampToValueAtTime(0, t + d * 0.98);
    } else { // melody and bass: soft attack, decay, sustain, release
      const r = Math.min(0.4, d * 0.3);
      g.linearRampToValueAtTime(a, t + 0.04); g.linearRampToValueAtTime(a * 0.65, t + Math.min(0.45, d - r));
      g.setValueAtTime(a * 0.65, t + d - r); g.linearRampToValueAtTime(0, t + d * 0.99);
      if (v === 0) { vib.setValueAtTime(0, t); vib.linearRampToValueAtTime(0, t + d * 0.3); vib.linearRampToValueAtTime(Math.min(12, d * 5), t + d * 0.99); } // delayed vibrato, cents
    }
  };
  // write every note that starts within AHEAD seconds; a note already due (the page stalled longer than that) is
  // skipped rather than played late, so a stall leaves a rest, never a click
  const tick = () => {
    const now = ctx.currentTime, until = now + AHEAD;
    for (;;) {
      const t = t0 + (n * LOOP + ES[i]) * STEP;
      if (t >= until) break;
      if (t > now + 0.01) play(i, t);
      if (++i === NE) { i = 0; n++; }
    }
  };

  const build = () => {
    ctx = new AudioContext({ latencyHint: 'playback' });
    out = new GainNode(ctx, { gain: 0 }); out.connect(ctx.destination);
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: CUTOFF, Q: -3 }); lp.connect(out); // Q in dB: no resonance
    const dl = new DelayNode(ctx, { delayTime: ECHO[0] * 60 / BPM, maxDelayTime: 5 }), damp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1800, Q: -3 });
    const fb = new GainNode(ctx, { gain: ECHO[1] }), wet = new GainNode(ctx, { gain: ECHO[2] });
    lp.connect(dl); dl.connect(damp); damp.connect(fb); fb.connect(dl); damp.connect(wet); wet.connect(out);
    // a 25% pulse for the melody (brighter than the square), as a Fourier series
    const re = new Float32Array(64), im = new Float32Array(64);
    for (let h = 1; h < 64; h++) re[h] = Math.sin(Math.PI * h * 0.25) * 2 / (Math.PI * h);
    osc = [new OscillatorNode(ctx, { periodicWave: new PeriodicWave(ctx, { real: re, imag: im }) }), new OscillatorNode(ctx, { type: 'square' }), new OscillatorNode(ctx, { type: 'triangle' })];
    // shimmer: two seconds of looped white noise, band-passed around 4 kHz
    const nb = new AudioBuffer({ length: 2 * ctx.sampleRate, sampleRate: ctx.sampleRate }), nd = nb.getChannelData(0);
    for (let k = 0, s = 1; k < nd.length; k++) { s = (Math.imul(s, 1664525) + 1013904223) | 0; nd[k] = s / 2147483648; }
    const noise = new AudioBufferSourceNode(ctx, { buffer: nb, loop: true }), bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 4000, Q: 0.8 });
    noise.connect(bp);
    amp = [0.2, -0.25, 0, 0].map((p, v) => { const g = new GainNode(ctx, { gain: 0 }), s = new StereoPannerNode(ctx, { pan: p }); (v < 3 ? osc[v] : bp).connect(g); g.connect(s); s.connect(lp); return g; });
    const lfo = new OscillatorNode(ctx, { frequency: 5.5 }), depth = new GainNode(ctx, { gain: 0 }); lfo.connect(depth); depth.connect(osc[0].detune); vib = depth.gain;
    for (const o of [...osc, noise, lfo]) o.start();
    t0 = ctx.currentTime + 0.2;
  };

  // play while not muted and the tab is visible; otherwise fade out, then suspend the audio clock (where the music
  // waits) and stop the timer
  const apply = () => {
    clearTimeout(off);
    const now = ctx.currentTime;
    if (!muted && !document.hidden) {
      if (ctx.state !== 'running') ctx.resume().catch(() => 0);
      out.gain.setTargetAtTime(VOLUME, now, 0.1);
      if (!timer) { tick(); timer = setInterval(tick, 250); }
    } else {
      out.gain.setTargetAtTime(0, now, 0.03);
      off = setTimeout(() => { if (muted || document.hidden) { ctx.suspend(); clearInterval(timer); timer = 0; } }, 300);
    }
  };
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
  const gesture = () => {
    if (!ctx) { try { build(); } catch (e) { console.warn('music: ' + e.message); ctx = null; GESTURES.forEach((g) => removeEventListener(g, gesture, true)); return; } }
    apply();
    if (ctx.state === 'running' || muted) GESTURES.forEach((g) => removeEventListener(g, gesture, true));
  };
  if (!AUTO) {
    GESTURES.forEach((g) => addEventListener(g, gesture, true));
    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      muted = !muted; try { localStorage.atlantisMute = muted ? '1' : ''; } catch {}
      if (ctx) apply();
    }, true);
    document.addEventListener('visibilitychange', () => { if (ctx) apply(); });
  }
}
