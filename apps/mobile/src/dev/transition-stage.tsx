import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedBlurOverlay, Sheet } from '../design/sheet';
import { DURATIONS, EASINGS } from '../design/motion';

/**
 * The three signature transitions from the round-2 bake-off, built for real so the frame budget
 * can be MEASURED rather than argued.
 *
 * **This file answers one question per direction and nothing else.** It is not the motion system;
 * it has no skip, no speed scale and no token lint. Those are Phase 4C and they will replace most
 * of it. What survives the rewrite is the measurement.
 *
 * | direction | the specific risk                    | the dial that tests it |
 * | --------- | ------------------------------------ | ---------------------- |
 * | D dolly   | an ANIMATED blur radius              | on/off                 |
 * | E shuffle | OVERDRAW: stacked translucent layers | `blurLayers` 0..5      |
 * | F wipe    | none suspected — the control         | ignored                |
 *
 * F is included precisely because nothing about it is in doubt: it is the floor the other two are
 * read against, and a run where F also stutters is measuring the device or the harness.
 *
 * ## Why `Sheet` and not `BlurView` directly
 *
 * `backdrop-filter` does not exist in React Native. What E's glass actually costs on a device is
 * the platform's own backdrop blur reading the framebuffer behind each sheet, and `expo-blur` is
 * that. **But nothing outside `src/design/` may import it** — `eslint.config.mjs` enforces it —
 * because whether a future Android failure is a token change or a redesign depends entirely on
 * that boundary holding. Measuring the real `Sheet` is better science anyway: the number then
 * applies to the component the app will actually ship.
 */

export const TRANSITIONS = ['dolly', 'shuffle', 'wipe'] as const;
export type TransitionName = (typeof TRANSITIONS)[number];

const bezier = (t: readonly [number, number, number, number]) =>
  Easing.bezier(t[0], t[1], t[2], t[3]);

export type TransitionStageProps = {
  readonly name: TransitionName;
  /** Increment to replay. A token rather than a boolean so a repeat play is not a no-op. */
  readonly playToken: number;
  /**
   * Simultaneous live backdrop-blur layers, 0..5. Only `shuffle` reads it.
   *
   * **0 is a real setting, not "off".** It is the no-blur baseline every sweep row is subtracted
   * from, and it is simultaneously the flat-fill design `Sheet` renders when the glass budget is
   * spent. The baseline and the fallback are the same measurement.
   */
  readonly blurLayers: number;
  /** Render the DESIGNED alternative, not the animation switched off. */
  readonly reduceMotion: boolean;
  /**
   * Repeat forever instead of playing once.
   *
   * The sweep needs it: a blur costs something only while the content behind it is CHANGING, so
   * measuring a settled screen would report the compositor's cached result and clear direction E
   * on a reading of nothing happening.
   */
  readonly loop?: boolean;
};

export function TransitionStage(props: TransitionStageProps) {
  const { name, playToken, blurLayers, reduceMotion, loop = false } = props;
  // 0 = the outgoing card is at rest; 1 = the transition has completed.
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = 0;
    t.value = withDelay(
      16,
      withRepeat(
        withTiming(1, {
          duration: reduceMotion ? DURATIONS.micro : DURATIONS.transition,
          easing: bezier(reduceMotion ? EASINGS.linear : EASINGS.entrance),
        }),
        loop ? -1 : 1,
        false,
      ),
    );
  }, [playToken, reduceMotion, loop, t]);

  return (
    <View style={styles.stage}>
      <View style={styles.ground} />
      {name === 'shuffle' ? <ShuffleLayers layers={blurLayers} t={t} rm={reduceMotion} /> : null}
      {name === 'dolly' ? <DollyLayers t={t} rm={reduceMotion} /> : null}
      {name === 'wipe' ? <WipeLayers t={t} rm={reduceMotion} /> : null}
    </View>
  );
}

/* ── D — DOLLY ────────────────────────────────────────────────────────────────────────────
 * The card recedes on Z, blurs and desaturates while the next comes forward out of depth.
 * The cost under test is the ANIMATED blur intensity: a static blur is cached, a changing one
 * re-reads its source every frame.
 */
function DollyLayers({ t, rm }: { readonly t: SharedValue<number>; readonly rm: boolean }) {
  const outStyle = useAnimatedStyle(() => {
    if (rm) return { opacity: 1 - t.value * 0.72, transform: [] };
    return {
      opacity: 1 - t.value * 0.72,
      transform: [
        { perspective: 900 },
        { translateY: -26 * t.value },
        { scale: 1 - 0.22 * t.value },
      ],
    };
  });
  const inStyle = useAnimatedStyle(() => {
    if (rm) return { opacity: t.value, transform: [] };
    return {
      opacity: t.value,
      transform: [
        { perspective: 900 },
        { translateY: 58 * (1 - t.value) },
        { scale: 0.82 + 0.18 * t.value },
      ],
    };
  });
  // The measurement. Intensity is a native prop, so animating it through `animatedProps` keeps the
  // driver on the UI thread — and still forces the platform to re-blur every frame.
  const blurProps = useAnimatedProps(() => ({ intensity: rm ? 0 : Math.round(t.value * 44) }));

  return (
    <>
      <Animated.View style={[styles.card, outStyle]}>
        <Sheet frosted={false} style={styles.fill}>
          <CardFace title="The Late Booth" line="He keeps the passport and asks you to wait." />
        </Sheet>
        {!rm ? <AnimatedBlurOverlay animatedProps={blurProps} /> : null}
      </Animated.View>
      <Animated.View style={[styles.card, inStyle]}>
        <Sheet frosted={false} style={styles.fill}>
          <CardFace title="The Shared Room" line="Four beds, three of them taken." />
        </Sheet>
      </Animated.View>
    </>
  );
}

/* ── E — SHUFFLE — THE CHOSEN DIRECTION, AND THE ONE THAT MUST BE MEASURED ─────────────────
 * The answered sheet rotates out on Y; the next rises from beneath the stack.
 *
 * `layers` is the number of LIVE blur layers, counted the way the design system will have to
 * budget them rather than the way this component happens to nest:
 *
 *   0  — nothing frosted. The baseline, and the flat-fill fallback design.
 *   1  — the outgoing sheet only.
 *   2  — both sheets. THE VERDICT IS READ HERE (`sweep.ts` VERDICT_LAYERS).
 *   3+ — both sheets plus `layers - 2` frosted sheets stacked underneath.
 *
 * Monotone by construction, so each sweep row is comparable to the one above it.
 */
function ShuffleLayers({
  layers,
  t,
  rm,
}: {
  readonly layers: number;
  readonly t: SharedValue<number>;
  readonly rm: boolean;
}) {
  const outStyle = useAnimatedStyle(() => {
    if (rm) return { opacity: 1 - t.value, transform: [] };
    return {
      opacity: 1 - t.value,
      transform: [
        { perspective: 800 },
        { rotateY: `${-19 * t.value}deg` },
        { translateX: -52 * t.value },
        { translateY: -30 * t.value },
        { scale: 1 - 0.03 * t.value },
      ],
    };
  });
  const inStyle = useAnimatedStyle(() => {
    if (rm) return { opacity: t.value, transform: [] };
    return {
      opacity: t.value,
      transform: [{ translateY: 34 * (1 - t.value) }, { scale: 0.955 + 0.045 * t.value }],
    };
  });

  // Reduce motion never renders live blur: its designed alternative is flat by construction, and
  // measuring it with blur on would price a form the player never sees.
  const live = rm ? 0 : layers;
  const underSheets = Math.max(0, live - 2);

  return (
    <>
      {Array.from({ length: underSheets }, (_, i) => (
        <Sheet
          key={`under-${String(i)}`}
          frosted
          intensity={24}
          style={[
            styles.card,
            styles.underSheet,
            { left: 18 + i * 4, right: 18 + i * 4, top: 26 + i * 7 },
          ]}
        />
      ))}
      <Animated.View style={[styles.card, styles.lifted, outStyle]}>
        <Sheet frosted={live >= 1} intensity={26} style={styles.fill}>
          <CardFace title="The Late Booth" line="He keeps the passport and asks you to wait." />
        </Sheet>
      </Animated.View>
      <Animated.View style={[styles.card, styles.lifted, inStyle]}>
        <Sheet frosted={live >= 2} intensity={26} style={styles.fill}>
          <CardFace title="The Shared Room" line="Four beds, three of them taken." />
        </Sheet>
      </Animated.View>
    </>
  );
}

/* ── F — WIPE — THE CONTROL ────────────────────────────────────────────────────────────────
 * A band of light crosses; behind it is new, ahead of it is old. Nothing translates more than
 * 6px, nothing blurs, nothing stacks.
 */
function WipeLayers({ t, rm }: { readonly t: SharedValue<number>; readonly rm: boolean }) {
  const outStyle = useAnimatedStyle(() => ({
    opacity: t.value < 0.44 ? 1 - t.value / 0.44 : 0,
    transform: rm ? [] : [{ translateX: -6 * t.value }],
  }));
  const inStyle = useAnimatedStyle(() => ({
    opacity: t.value > 0.46 ? (t.value - 0.46) / 0.54 : 0,
    transform: rm ? [] : [{ translateX: 6 * (1 - t.value) }],
  }));
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: rm ? 0 : t.value > 0.02 && t.value < 0.98 ? 0.9 : 0,
    transform: [{ translateX: -160 + 460 * t.value }],
  }));

  return (
    <>
      <Animated.View style={[styles.card, outStyle]}>
        <Sheet frosted={false} style={styles.fill}>
          <CardFace title="The Late Booth" line="He keeps the passport and asks you to wait." />
        </Sheet>
      </Animated.View>
      <Animated.View style={[styles.card, inStyle]}>
        <Sheet frosted={false} style={styles.fill}>
          <CardFace title="The Shared Room" line="Four beds, three of them taken." />
        </Sheet>
      </Animated.View>
      <Animated.View style={[styles.sweep, sweepStyle]} pointerEvents="none" />
    </>
  );
}

function CardFace({ title, line }: { readonly title: string; readonly line: string }) {
  return (
    <View style={styles.face}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.line}>{line}</Text>
      <View style={styles.row} />
      <View style={styles.row} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { left: 16, position: 'absolute', right: 16, top: 20 },
  face: { padding: 13 },
  fill: { width: '100%' },
  ground: {
    backgroundColor: '#0e0f11',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  // The shadow is STATIC. See docs/web-preview-traps.md trap 5: E's signature is a card lifting AS
  // ITS SHADOW LENGTHENS, and that ramp is NOT implemented here — so this instrument under-measures
  // E, and the ramp is unvalidated on every platform. `elevation` is Android-only and cannot express
  // it; RN 0.86's cross-platform `boxShadow` is the route, and interpolating it per frame is its own
  // problem rather than a one-line swap.
  lifted: {
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
  },
  line: { color: '#b6bcc4', fontSize: 13.5, lineHeight: 19 },
  row: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6, height: 34, marginTop: 10 },
  stage: { backgroundColor: '#0e0f11', height: 260, overflow: 'hidden', position: 'relative' },
  sweep: {
    backgroundColor: 'rgba(255,107,53,0.5)',
    bottom: 0,
    position: 'absolute',
    top: 0,
    width: 120,
  },
  title: { color: '#f2f3f5', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  underSheet: { bottom: 40 },
});
