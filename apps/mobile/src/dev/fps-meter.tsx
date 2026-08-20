import { useEffect } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
  type FrameInfo,
} from 'react-native-reanimated';
import { BUDGET_MS, DROP_FACTOR, EMPTY_FOLD, foldFrame, type FrameFold } from './frame-fold';

/**
 * A frame meter that runs entirely on the UI thread.
 *
 * ## Why it cannot use a clock
 *
 * CLAUDE.md rule 2.3 bans `Date.now()` repo-wide and permits exactly one wall-clock read, in
 * `src/clock/system-clock.ts`. `performance.now()` is banned in the engine for the same reason and
 * would be the same mistake here. **`useFrameCallback` hands the delta in**: `FrameInfo` carries
 * `timeSincePreviousFrame`, measured by the frame scheduler itself, so this component needs no
 * time source at all.
 *
 * ## Why it must not touch the JS thread
 *
 * A frame meter that reports through `runOnJS` measures the thing it is perturbing — every sample
 * would schedule JS work on the very thread whose contention it is trying to detect, and the
 * numbers would get worse the more closely you watched. Everything here stays in worklets:
 * `useFrameCallback` writes shared values and `useAnimatedProps` reads them, with no React render
 * per frame.
 *
 * ## Why the readouts are TextInputs
 *
 * `Text` has no writable prop that Reanimated can drive, so updating it from the UI thread means
 * a `setState` per frame — the exact JS-thread work this component exists to avoid. `TextInput`
 * has `value`, which is a real, typed, animatable prop. The inputs are `editable={false}` and
 * `pointerEvents="none"`, so they are readouts that happen to be built from an input.
 *
 * ## What to read
 *
 * **`worst` is the number that matters, not `fps`.** A mean of 60 with one 90 ms frame in it is a
 * visible hitch and a passing average. The 60fps floor is a claim about the worst frame during
 * the busiest sequence, so `worst` is printed at the same size, and `dropped` counts frames over
 * budget since the last reset.
 */

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export type FpsMeterProps = {
  /** Change this to reset the counters — e.g. when a new sequence starts playing. */
  readonly resetKey?: number;
};

export function FpsMeter({ resetKey = 0 }: FpsMeterProps) {
  // ONE shared value holding the whole reading, rather than five scalars. That is what lets the
  // arithmetic live in `frame-fold.ts` as a pure function with a test — see its header for why
  // that split matters on an instrument no browser can exercise.
  const fold = useSharedValue<FrameFold>(EMPTY_FOLD);

  // `resetKey` is MIRRORED into a shared value rather than closed over. Two reasons, and the
  // second is load-bearing:
  //
  //   1. The worklet below then captures nothing that changes, so it is created once.
  //   2. `react-hooks/immutability` (React Compiler, via eslint-config-expo) treats anything
  //      passed to a hook — a `useCallback` dependency array included — as immutable, and a frame
  //      worklet's whole job is to mutate shared values. Wrapping it in `useCallback` with the
  //      shared values as deps is exactly what trips that rule. Inlining is the fix rather than an
  //      eslint-disable: the callback was never usefully re-created, because shared values are
  //      stable references.
  const resetSignal = useSharedValue(resetKey);
  const lastReset = useSharedValue(resetKey);
  useEffect(() => {
    resetSignal.value = resetKey;
  }, [resetKey, resetSignal]);

  useFrameCallback((info: FrameInfo) => {
    'worklet';
    // Detected on the UI thread rather than in an effect, so a replay clears the counters on the
    // same frame the sequence starts instead of one JS tick later.
    if (lastReset.value !== resetSignal.value) {
      lastReset.value = resetSignal.value;
      fold.value = EMPTY_FOLD;
    }
    fold.value = foldFrame(fold.value, info.timeSincePreviousFrame);
  }, true);

  const fpsProps = useAnimatedProps(() => ({ value: String(fold.value.fps) }));
  const worstProps = useAnimatedProps(() => ({ value: `${fold.value.worst.toFixed(1)} ms` }));
  const droppedProps = useAnimatedProps(() => ({ value: String(fold.value.dropped) }));

  return (
    <View style={styles.row}>
      <Stat label="fps" animatedProps={fpsProps} />
      <Stat label="worst frame" animatedProps={worstProps} />
      <Stat
        label={`frames > ${(BUDGET_MS * DROP_FACTOR).toFixed(0)}ms`}
        animatedProps={droppedProps}
      />
    </View>
  );
}

function Stat({
  label,
  animatedProps,
}: {
  readonly label: string;
  readonly animatedProps: ReturnType<typeof useAnimatedProps<{ value: string }>>;
}) {
  return (
    <View style={styles.stat}>
      <AnimatedTextInput
        animatedProps={animatedProps}
        editable={false}
        pointerEvents="none"
        style={styles.big}
        underlineColorAndroid="transparent"
      />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  big: {
    color: '#f2f3f5',
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    padding: 0,
  },
  label: {
    color: '#838992',
    fontSize: 10,
    letterSpacing: 0.8,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  row: {
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stat: { alignItems: 'flex-start' },
});
