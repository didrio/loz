/**
 * Timeline → parameter frames: the synth's automation lanes, one value every 5 ms for each
 * knob of the formant voice (pitch, source levels, formant frequencies and bandwidths). This is
 * where coarticulation happens: formants glide between sounds (with consonant loci, so a D
 * before "ee" and before "oo" start in different places), stops get their closure, burst and
 * breath, vowels before a nasal pick up a little nasality.
 *
 * Two kinds of lane:
 * - formants: control points joined by straight lines, then lightly smoothed (curves, not corners);
 * - source levels: sums of trapezoid "pulses" (a sound's level with ramps at its edges), so
 *   neighbors crossfade and a burst can sit on top of whatever else is playing.
 */
import { clamp } from '../../core/math';
import { HIGH_FORMANTS, LOCI, NASAL_MURMUR, NASAL_REST, isSyllabic, type Formants, type Manner, type Parallel, type PhonemeSpec } from './phonemes';
import { trackAt, type Segment, type Timeline } from './prosody';

export const FRAME_STEP = 0.005;

export const PARAMS = [
  'f0', 'av', 'avs', 'ah', 'g2', 'g3', 'g4', 'g5', 'g6', 'gb', 'voicedFric',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'fnp', 'fnz', 'bnp', 'bnz',
  'breath', 'oq', 'tilt',
] as const;
export type Param = (typeof PARAMS)[number];

export interface Frames {
  step: number;
  count: number;
  /** One lane per parameter. Levels are linear (1 = Klatt's 60 dB), frequencies Hz, tilt dB. */
  p: Record<Param, Float32Array>;
}

/** Klatt-style dB (60 = a full vowel) to a linear level; 0 dB means off. */
export const lin = (db: number) => (db <= 0 ? 0 : 10 ** ((db - 60) / 20));

/** A point lane: straight lines between points, held flat past the ends. */
class PointLane {
  private pts: { t: number; v: number }[] = [];
  add(t: number, v: number) {
    this.pts.push({ t, v });
  }
  render(out: Float32Array, step: number, fallback: number) {
    const pts = this.pts.sort((a, b) => a.t - b.t);
    if (pts.length === 0) {
      out.fill(fallback);
      return;
    }
    let j = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i * step;
      while (j < pts.length - 1 && pts[j + 1].t <= t) j++;
      if (t <= pts[0].t) out[i] = pts[0].v;
      else if (j >= pts.length - 1) out[i] = pts[pts.length - 1].v;
      else {
        const a = pts[j];
        const b = pts[j + 1];
        out[i] = b.t > a.t ? a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) : b.v;
      }
    }
  }
}

/** A pulse lane: a sum of trapezoids. Each ramps up across [t0 − rIn/2, t0 + rIn/2] and down across [t1 − rOut/2, t1 + rOut/2]. */
class PulseLane {
  private pulses: { t0: number; t1: number; rIn: number; rOut: number; v: number }[] = [];
  add(t0: number, t1: number, v: number, rIn: number, rOut: number) {
    if (v > 0 && t1 > t0) this.pulses.push({ t0, t1, rIn: Math.max(rIn, 1e-4), rOut: Math.max(rOut, 1e-4), v });
  }
  render(out: Float32Array, step: number) {
    out.fill(0);
    for (const p of this.pulses) {
      const a = p.t0 - p.rIn / 2;
      const b = p.t1 + p.rOut / 2;
      const i0 = Math.max(0, Math.floor(a / step));
      const i1 = Math.min(out.length - 1, Math.ceil(b / step));
      for (let i = i0; i <= i1; i++) {
        const t = i * step;
        const up = clamp((t - a) / p.rIn, 0, 1);
        const down = clamp((b - t) / p.rOut, 0, 1);
        out[i] += p.v * Math.min(up, down);
      }
    }
  }
}

const transitionTime = (m: Manner | undefined) => {
  switch (m) {
    case 'stop':
    case 'affricate':
      return 0.045;
    case 'nasal':
      return 0.035;
    case 'fricative':
      return 0.04;
    case 'liquid':
    case 'glide':
      return 0.06;
    case 'aspirate':
      return 0.01;
    case 'vowel':
    case 'diphthong':
      return 0.05;
    default:
      return 0;
  }
};

/** The crossfade time at the boundary between two sounds' source levels. */
function boundaryRamp(left: PhonemeSpec | null, right: PhonemeSpec | null) {
  if (!left) return right && isSyllabic(right) ? 0.02 : 0.012; // a soft attack out of silence
  if (!right) return isSyllabic(left) || left.manner === 'nasal' || left.manner === 'liquid' ? 0.05 : 0.02; // a soft release into silence
  if (left.manner === 'stop' || right.manner === 'stop') return 0.006;
  if (left.manner === 'fricative' || right.manner === 'fricative') return 0.014;
  return 0.012;
}

const FORMANT_KEYS = ['f1', 'f2', 'f3', 'b1', 'b2', 'b3'] as const;
const locusValue = (place: PhonemeSpec['place'], key: 'f1' | 'f2' | 'f3', vowel: number) => {
  const l = LOCI[place]?.[key];
  return l ? l[0] + l[1] * (vowel - l[0]) : undefined;
};

const parallelGains = (af: number, par: Parallel) => {
  const a = lin(af);
  return { g2: a * lin(par.a2), g3: a * lin(par.a3), g4: a * lin(par.a4), g5: a * lin(par.a5), g6: a * lin(par.a6), gb: a * lin(par.ab) };
};

export function buildFrames(tl: Timeline, step = FRAME_STEP): Frames {
  const count = Math.ceil(tl.duration / step) + 2;
  const p = Object.fromEntries(PARAMS.map((k) => [k, new Float32Array(count)])) as Record<Param, Float32Array>;
  const segs = tl.segments;
  const voice = tl.voice;

  const formant = Object.fromEntries(FORMANT_KEYS.map((k) => [k, new PointLane()])) as Record<(typeof FORMANT_KEYS)[number], PointLane>;
  const fnz = new PointLane();
  const fnp = new PointLane();
  const breath = new PointLane();
  const tilt = new PointLane();
  const av = new PulseLane();
  const avs = new PulseLane();
  const ah = new PulseLane();
  const devoice = new PulseLane();
  const voicedFric = new PulseLane();
  const par = { g2: new PulseLane(), g3: new PulseLane(), g4: new PulseLane(), g5: new PulseLane(), g6: new PulseLane(), gb: new PulseLane() };
  const addParallel = (t0: number, t1: number, gains: ReturnType<typeof parallelGains>, scale: number, rIn: number, rOut: number) => {
    for (const k of ['g2', 'g3', 'g4', 'g5', 'g6', 'gb'] as const) par[k].add(t0, t1, gains[k] * scale, rIn, rOut);
  };
  const addFormants = (t: number, f: Formants) => {
    for (const k of FORMANT_KEYS) formant[k].add(t, f[k]);
  };

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (!s.spec) continue;
    const sp = s.spec;
    const a = s.start;
    const d = s.dur;
    const b = a + d;
    const prev: Segment | undefined = segs[i - 1];
    const next: Segment | undefined = segs[i + 1];
    const rIn = boundaryRamp(prev?.spec ?? null, sp);
    const rOut = boundaryRamp(sp, next?.spec ?? null);

    // Formant targets.
    if (isSyllabic(sp)) {
      const tIn = Math.min(transitionTime(prev?.spec?.manner), 0.4 * d);
      const tOut = Math.min(transitionTime(next?.spec?.manner), 0.4 * d);
      addFormants(a + tIn, sp.target);
      if (sp.manner === 'diphthong') {
        addFormants(Math.max(a + tIn, a + 0.3 * d), sp.target);
        addFormants(b - Math.min(tOut, 0.15 * d), sp.glide!);
      } else addFormants(b - tOut, sp.glide ?? sp.target);
    } else if (sp.manner === 'liquid' || sp.manner === 'glide') {
      addFormants(a + 0.35 * d, sp.target);
      addFormants(b - 0.35 * d, sp.target);
    } else if (sp.manner === 'stop') {
      addFormants(a + 0.5 * d, sp.target);
    } else {
      addFormants(a + 0.15 * d, sp.target);
      addFormants(b - 0.15 * d, sp.target);
    }
    // Locus points where a consonant meets a vowel.
    if (next?.spec) {
      const n = next.spec;
      const [c, v, vowelSide] = isSyllabic(n) && !isSyllabic(sp) ? [sp, n, n.target] : isSyllabic(sp) && !isSyllabic(n) ? [n, sp, sp.glide ?? sp.target] : [null, null, null];
      if (c && v && vowelSide && LOCI[c.place] && c.manner !== 'liquid' && c.manner !== 'glide') {
        const at = c.manner === 'nasal' ? [b - 0.004, b + 0.004] : [b];
        for (const t of at) {
          for (const k of ['f1', 'f2', 'f3'] as const) {
            const lv = locusValue(c.place, k, vowelSide[k]);
            if (lv !== undefined) formant[k].add(t, lv);
          }
        }
      }
    }

    // Nasality: the murmur, with the vowel before it nasalized over its last part.
    if (sp.manner === 'nasal') {
      fnz.add(a + 0.004, NASAL_MURMUR.fnz);
      fnz.add(b - 0.004, NASAL_MURMUR.fnz);
      fnp.add(a + 0.004, NASAL_MURMUR.fnp);
      fnp.add(b - 0.004, NASAL_MURMUR.fnp);
    } else {
      const nasalNext = next?.spec?.manner === 'nasal';
      const nasalPrev = prev?.spec?.manner === 'nasal';
      fnz.add(nasalPrev ? a + Math.min(0.03, d / 2) : a + 0.25 * d, NASAL_REST.fnz);
      fnz.add(nasalNext && isSyllabic(sp) ? b - 0.4 * d : b - 0.25 * d, NASAL_REST.fnz);
      fnp.add(a + 0.5 * d, NASAL_REST.fnp);
    }

    // Sources.
    switch (sp.manner) {
      case 'vowel':
      case 'diphthong':
      case 'liquid':
      case 'glide':
      case 'nasal':
        av.add(a, b, lin(sp.av), rIn, rOut);
        break;
      case 'aspirate': {
        ah.add(a, b, lin(sp.ah), rIn, rOut);
        // Between voiced sounds, H keeps a little voice ("ahead").
        if (prev?.spec?.voiced && next?.spec?.voiced) av.add(a, b, lin(sp.av || 48), rIn, rOut);
        break;
      }
      case 'fricative': {
        const g = parallelGains(sp.af, sp.par);
        addParallel(a, b, g, 1, rIn, rOut);
        if (sp.voiced) {
          av.add(a, b, lin(sp.av), rIn, rOut);
          voicedFric.add(a, b, 1, rIn, rOut);
        }
        break;
      }
      case 'stop':
      case 'affricate': {
        if (s.flap) {
          av.add(a, b, lin(42), 0.008, 0.008);
          break;
        }
        const rel = s.release;
        if (s.voiceBar) avs.add(a, rel ?? b, lin(47), rIn, 0.004);
        if (rel === undefined) break;
        const burst = sp.burst!;
        const bEnd = rel + burst.dur;
        addParallel(rel, bEnd, parallelGains(burst.af, burst.par), s.burstGain ?? 1, 0.001, 0.006);
        if (sp.manner === 'affricate') {
          // The SH after the release.
          addParallel(bEnd, b, parallelGains(sp.af, sp.par), 1, 0.006, rOut);
          if (sp.voiced) {
            av.add(bEnd, b, lin(sp.av), 0.01, rOut);
            voicedFric.add(bEnd, b, 1, 0.01, rOut);
          }
        } else if (s.vot && !sp.voiced) {
          // Aspiration: breath through the opening tract, no voice yet.
          const w1 = bEnd + s.vot;
          ah.add(bEnd, w1, lin(56), 0.003, 0.016);
          devoice.add(bEnd - 0.01, w1, 1, 0.002, 0.012);
        }
        break;
      }
    }
    // Phrase ends go breathy and soft.
    if (s.phraseFinal && (!next?.spec)) {
      breath.add(Math.max(a, b - 0.18), voice.breathiness);
      breath.add(b + 0.03, clamp(voice.breathiness + 0.25, 0, 1));
      tilt.add(Math.max(a, b - 0.18), voice.tilt);
      tilt.add(b + 0.03, voice.tilt + 5);
      breath.add(b + 0.08, voice.breathiness);
      tilt.add(b + 0.08, voice.tilt);
    }
  }

  for (const k of FORMANT_KEYS) formant[k].render(p[k], step, 500);
  // Formants: round the corners (a ~20 ms triangular smoothing).
  for (const k of ['f1', 'f2', 'f3', 'b1', 'b2', 'b3'] as const) smoothLane(p[k], 2);
  fnz.render(p.fnz, step, NASAL_REST.fnz);
  fnp.render(p.fnp, step, NASAL_REST.fnp);
  smoothLane(p.fnz, 1);
  av.render(p.av, step);
  avs.render(p.avs, step);
  ah.render(p.ah, step);
  voicedFric.render(p.voicedFric, step);
  for (const k of ['g2', 'g3', 'g4', 'g5', 'g6', 'gb'] as const) par[k].render(p[k], step);
  const dv = new Float32Array(count);
  devoice.render(dv, step);
  breath.add(0, voice.breathiness);
  tilt.add(0, voice.tilt);
  breath.render(p.breath, step, voice.breathiness);
  tilt.render(p.tilt, step, voice.tilt);

  const scale = voice.tractScale;
  const bwScale = Math.sqrt(scale);
  for (let i = 0; i < count; i++) {
    const t = i * step;
    const env = trackAt(tl.amp, t);
    p.f0[i] = trackAt(tl.f0, t);
    p.av[i] *= env * (1 - clamp(dv[i], 0, 1));
    p.avs[i] *= env;
    p.ah[i] *= env;
    for (const k of ['g2', 'g3', 'g4', 'g5', 'g6', 'gb'] as const) p[k][i] *= env;
    p.f1[i] *= scale;
    p.f2[i] *= scale;
    p.f3[i] *= scale;
    p.f4[i] = HIGH_FORMANTS.f4 * scale;
    p.f5[i] = HIGH_FORMANTS.f5 * scale;
    p.f6[i] = HIGH_FORMANTS.f6 * scale;
    p.b1[i] = p.b1[i] * bwScale + 60 * p.breath[i];
    p.b2[i] *= bwScale;
    p.b3[i] *= bwScale;
    p.b4[i] = HIGH_FORMANTS.b4 * bwScale;
    p.b5[i] = HIGH_FORMANTS.b5 * bwScale;
    p.b6[i] = HIGH_FORMANTS.b6 * bwScale;
    p.fnp[i] *= scale;
    p.fnz[i] *= scale;
    p.bnp[i] = NASAL_REST.bnp;
    p.bnz[i] = NASAL_REST.bnz;
    p.oq[i] = voice.openQuotient;
  }
  return { step, count, p };
}

function smoothLane(x: Float32Array, passes: number) {
  const tmp = new Float32Array(x.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < x.length; i++) tmp[i] = (x[Math.max(0, i - 1)] + 2 * x[i] + x[Math.min(x.length - 1, i + 1)]) / 4;
    x.set(tmp);
  }
}
