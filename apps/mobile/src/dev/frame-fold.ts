/**
 * The frame-meter arithmetic, as a pure function.
 *
 * ## Why this is not inlined in the worklet
 *
 * The meter it feeds is a NATIVE instrument: `useFrameCallback` does not drive the readout under
 * react-native-web, so nothing about the meter can be verified in a browser. Left inside the
 * worklet, a mistake in this fold would be discovered on the device — during the one session where
 * somebody has a low-end Android phone plugged in and is trying to measure something else.
 *
 * Pulled out, the arithmetic is ordinary TypeScript with an ordinary test, and the only thing left
 * unverified until a device exists is the platform wiring. That is the honest split, and it is the
 * difference between "the instrument is untested" and "the instrument's wiring is untested".
 *
 * Carries the `worklet` directive so the frame callback can call it on the UI thread; the
 * directive is inert when Jest calls it as a plain function.
 */

/** A frame longer than this is over the 60fps budget. */
export const BUDGET_MS = 1000 / 60;

/**
 * How far over budget a frame must run before it counts as dropped.
 *
 * 1.5x rather than 1x, and it is not slack: at a 60 Hz vsync an ordinary frame lands a little
 * either side of 16.7 ms, so counting every frame over the exact budget reports normal jitter as
 * jank and the meter never reads zero even on an idle screen.
 */
export const DROP_FACTOR = 1.5;

/** Frames folded into one fps reading. ~1s at 60fps: stable to read, quick to react. */
export const WINDOW_FRAMES = 60;

export type FrameFold = {
  /** Milliseconds accumulated in the current window. */
  readonly accum: number;
  /** Frames accumulated in the current window. */
  readonly frames: number;
  /** The longest single frame since the last reset — THE number the 60fps floor is about. */
  readonly worst: number;
  /** Frames over `BUDGET_MS * DROP_FACTOR` since the last reset. */
  readonly dropped: number;
  /** The last completed window's mean, or 0 before the first window closes. */
  readonly fps: number;
  /**
   * The last completed window's mean FRAME TIME in ms, or 0 before the first window closes.
   *
   * Redundant with `fps` — it is `1000 / fps` — and carried anyway, because the number the device
   * session actually needs is a DIFFERENCE between two means (`docs/device-measurement-session.md`
   * §3). Subtracting two fps readings does not give the cost of a blur layer; subtracting two
   * frame times does. Storing it removes a reciprocal from every call site that would otherwise
   * get it wrong once.
   */
  readonly meanMs: number;
};

export const EMPTY_FOLD: FrameFold = Object.freeze({
  accum: 0,
  frames: 0,
  worst: 0,
  dropped: 0,
  fps: 0,
  meanMs: 0,
});

/**
 * Fold one frame's duration into the running reading.
 *
 * `delta === null` is the first frame after mounting, which has no predecessor. It is IGNORED
 * rather than treated as 0: folding a zero in would divide by a smaller accumulator and report an
 * fps higher than the display can produce — the one reading that would make a janky device look
 * perfect.
 */
export function foldFrame(prev: FrameFold, delta: number | null): FrameFold {
  'worklet';
  if (delta === null) return prev;

  const accum = prev.accum + delta;
  const frames = prev.frames + 1;
  const worst = delta > prev.worst ? delta : prev.worst;
  const dropped = delta > BUDGET_MS * DROP_FACTOR ? prev.dropped + 1 : prev.dropped;

  // The window closes: publish a mean and start the next one. `worst` and `dropped` deliberately
  // do NOT reset here — they are cumulative since the last explicit reset, because the worst frame
  // of a whole sequence is the thing being measured, not the worst frame of the last second.
  if (frames >= WINDOW_FRAMES) {
    return {
      accum: 0,
      frames: 0,
      worst,
      dropped,
      fps: Math.round((1000 * frames) / accum),
      meanMs: accum / frames,
    };
  }

  return { accum, frames, worst, dropped, fps: prev.fps, meanMs: prev.meanMs };
}
