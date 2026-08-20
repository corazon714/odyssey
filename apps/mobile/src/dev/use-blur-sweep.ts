import { useCallback, useEffect, useState } from 'react';
import { runOnJS, useFrameCallback, useSharedValue, type FrameInfo } from 'react-native-reanimated';
import { EMPTY_FOLD, foldFrame, type FrameFold } from './frame-fold';
import { SWEEP_FRAMES, SWEEP_STEPS, type SweepRow } from './sweep';

/**
 * Drives the unattended blur sweep: hold each layer count for a fixed number of FRAMES, record a
 * row, advance.
 *
 * ## Why frames rather than a timer
 *
 * Two reasons and both matter. **CLAUDE.md rule 2.3** permits exactly one wall-clock read in the
 * repository and it is not here — a `setTimeout` would not technically read a clock, but stepping
 * on elapsed time while measuring frame time makes the step boundary a function of the thing under
 * test. **A slow step would get fewer frames**, so the worst readings would be averaged over the
 * smallest samples, which is precisely backwards. Counting frames gives every step the same
 * statistical weight regardless of how badly it performs.
 *
 * ## Why this exists at all
 *
 * `docs/device-measurement-session.md` §3: a human interactively driving a device introduces timing
 * variance, and — §5.2 — several of the cheap Android options are automation-only, with no
 * interactive remote access. **A lab that can run itself is what makes a free automated device farm
 * a viable measurement route rather than a hedge.** Press one button, wait ~12 s, read the table.
 *
 * ## EVERY SHARED VALUE HERE HAS EXACTLY ONE MUTATION SITE
 *
 * `react-hooks/immutability` (React Compiler, via eslint-config-expo) refuses a value to be
 * modified in one place when it was used in another that was passed to a hook — and it is
 * bidirectional, so an effect and a worklet cannot both write the same shared value.
 *
 * That reads as an obstacle and is actually the right shape. The two writers would be racing:
 * an effect writes during React's commit, a frame worklet writes on the UI thread, and a
 * re-render mid-sweep could reset a counter the worklet had already advanced. So the split below
 * is enforced rather than merely tidy:
 *
 * - **Written in the effect, read in the worklet:** `runSignal`, `activeSignal`. Both are mirrors
 *   of React state, so React remains the single source of truth about whether a sweep is running.
 * - **Written in the worklet only:** `lastRun`, `step`, `framesInStep`, `fold`, `finished`. The
 *   worklet resets them itself when it notices `runSignal` has moved.
 */

export type SweepState = {
  /** Increments per run, so a second sweep is not mistaken for a continuation of the first. */
  readonly runId: number;
  readonly running: boolean;
  /** Index into `SWEEP_STEPS`, or -1 when idle. */
  readonly stepIndex: number;
  readonly rows: readonly SweepRow[];
};

const IDLE: SweepState = { runId: 0, running: false, stepIndex: -1, rows: [] };

export type BlurSweep = {
  readonly state: SweepState;
  /** The layer count to render right now, or null when idle. */
  readonly activeLayers: number | null;
  readonly start: () => void;
  readonly cancel: () => void;
};

export function useBlurSweep(): BlurSweep {
  const [state, setState] = useState<SweepState>(IDLE);

  // Written in the effect, read in the worklet.
  const runSignal = useSharedValue(0);
  const activeSignal = useSharedValue(false);

  // Written in the worklet, never outside it.
  const lastRun = useSharedValue(-1);
  const step = useSharedValue(0);
  const framesInStep = useSharedValue(0);
  const finished = useSharedValue(false);
  const fold = useSharedValue<FrameFold>(EMPTY_FOLD);

  const record = useCallback((row: SweepRow) => {
    setState((prev) => {
      if (!prev.running) return prev;
      const rows = [...prev.rows, row];
      const nextIndex = prev.stepIndex + 1;
      // The sweep ends by falling off the end of SWEEP_STEPS rather than by a separate flag, so
      // "finished" and "collected every row" cannot disagree.
      if (nextIndex >= SWEEP_STEPS.length) return { ...prev, running: false, stepIndex: -1, rows };
      return { ...prev, stepIndex: nextIndex, rows };
    });
  }, []);

  const { runId, running } = state;
  useEffect(() => {
    runSignal.value = runId;
    activeSignal.value = running;
  }, [runId, running, runSignal, activeSignal]);

  useFrameCallback((info: FrameInfo) => {
    'worklet';
    if (!activeSignal.value) return;

    // A new run resets the worklet's own counters. Doing it here rather than in the effect is what
    // keeps every one of them single-writer; it also means the reset lands on the first measured
    // frame rather than one commit earlier.
    if (lastRun.value !== runSignal.value) {
      lastRun.value = runSignal.value;
      step.value = 0;
      framesInStep.value = 0;
      finished.value = false;
      fold.value = EMPTY_FOLD;
    }
    if (finished.value) return;

    fold.value = foldFrame(fold.value, info.timeSincePreviousFrame);
    if (info.timeSincePreviousFrame !== null) framesInStep.value += 1;
    if (framesInStep.value < SWEEP_FRAMES) return;

    const layers = SWEEP_STEPS[step.value] ?? 0;
    const done = fold.value;
    framesInStep.value = 0;
    fold.value = EMPTY_FOLD;
    step.value += 1;
    if (step.value >= SWEEP_STEPS.length) finished.value = true;

    // runOnJS: publishing a completed row is the ONLY crossing to the JS thread in this loop, and
    // it happens once per STEP — six times per sweep — rather than per frame. It has to cross,
    // because React state is where the table renders from; doing it at a step boundary rather than
    // per frame is what stops the measurement perturbing itself. The performance budget in
    // docs/art-direction.md §2 is why that distinction matters.
    runOnJS(record)({
      layers,
      meanMs: done.meanMs,
      worstMs: done.worst,
      dropped: done.dropped,
    });
  }, true);

  const start = useCallback(() => {
    setState((prev) => ({ runId: prev.runId + 1, running: true, stepIndex: 0, rows: [] }));
  }, []);

  const cancel = useCallback(() => {
    setState((prev) => ({ ...prev, running: false, stepIndex: -1 }));
  }, []);

  const activeLayers = state.running ? (SWEEP_STEPS[state.stepIndex] ?? null) : null;

  return { state, activeLayers, start, cancel };
}
