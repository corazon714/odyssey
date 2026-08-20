import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { FpsMeter } from '../../src/dev/fps-meter';
import { TRANSITIONS, TransitionStage, type TransitionName } from '../../src/dev/transition-stage';
import { useBlurSweep } from '../../src/dev/use-blur-sweep';
import { SWEEP_STEPS, formatSweepTable, verdictFor } from '../../src/dev/sweep';
import { DURATIONS, SPEED_NAMES, SPEED_SCALES, durationOf } from '../../src/design/motion';

/**
 * `/dev/motion-lab` — THE FRAME-BUDGET INSTRUMENT.
 *
 * ## What this screen is for, and what it is not
 *
 * It converts one sentence in `docs/art-direction.md` — "E's risk is overdraw, not blur ramps" —
 * into a number, on a device, before the design system is built on the answer. It is NOT the motion
 * lab Phase 4C ships: no skip, no persisted speed scale, no token lint, no primitive gallery. Those
 * replace most of this file; the measurement survives.
 *
 * ## How to read it
 *
 * 1. **Press RUN SWEEP.** It walks 0 → 5 blur layers unattended, ~2 s each, and prints a table plus
 *    a verdict. That is the whole measurement; the manual controls below are for looking at things.
 * 2. **Watch `worst frame`, not `fps`.** A mean of 60 containing one 90 ms frame is a visible hitch
 *    and a passing average.
 * 3. **The verdict is computed here on purpose.** It will be read on a phone held in one hand or —
 *    see `docs/device-measurement-session.md` §5.2 — off a compressed video stream from a remote
 *    device farm. Neither is a place to do division.
 * 4. Toggle **reduce motion** and confirm the alternative is still legible. A direction whose
 *    reduce-motion fallback is unusable is disqualified regardless of its frame numbers.
 *
 * **The reading is only meaningful on a device, and on the one available it can only KILL.**
 * `docs/device-measurement-session.md` §1: an iPhone SE 3 has fewer pixels to blur on a stronger
 * GPU than the low-end Android the 60 fps floor targets, so a failure here is strong evidence and a
 * pass here is not a pass. Expo web is worse still — no `BlurView` at all, so E's entire cost
 * disappears and this screen reports a comfortable, useless 60.
 *
 * Dev-only surface: `app/dev/_layout.tsx` returns `null` outside `__DEV__`, so the plain strings
 * below never reach a player. See CLAUDE.md §2.4.
 */
export default function MotionLab() {
  const [transition, setTransition] = useState<TransitionName>('shuffle');
  const [blurLayers, setBlurLayers] = useState(2);
  const [playToken, setPlayToken] = useState(0);
  const [speed, setSpeed] = useState<keyof typeof SPEED_SCALES>('full');
  const [forceReduce, setForceReduce] = useState(false);

  const systemReduce = useReducedMotion();
  const reduceMotion = forceReduce || systemReduce === true;
  const sweep = useBlurSweep();

  const play = useCallback(() => setPlayToken((n) => n + 1), []);
  const startSweep = useCallback(() => {
    // The sweep only means anything on `shuffle` — it is E's overdraw under test — and only with
    // reduce motion off, since that path renders no live blur at all by design.
    setTransition('shuffle');
    setForceReduce(false);
    sweep.start();
  }, [sweep]);

  const running = sweep.state.running;
  const layers = sweep.activeLayers ?? blurLayers;
  const verdict = verdictFor(sweep.state.rows);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Motion lab — frame budget spike</Text>
      <Text style={styles.p}>
        A failure here kills direction E. A pass here is not a pass — see
        device-measurement-session.md §1. ON EXPO WEB THIS SCREEN CANNOT WORK: there is no BlurView,
        and useFrameCallback never fires, so the sweep starts and then sits on step 1 forever. That
        is web-preview-traps.md traps 1 and 2, not a bug.
      </Text>

      <FpsMeter resetKey={playToken + sweep.state.rows.length * 1000} />

      <Pressable
        style={[styles.play, running && styles.playBusy]}
        onPress={running ? sweep.cancel : startSweep}
      >
        <Text style={styles.playText}>
          {running
            ? `SWEEPING — ${String(layers)} layers, step ${String(
                sweep.state.stepIndex + 1,
              )}/${String(SWEEP_STEPS.length)}   (tap to cancel)`
            : 'RUN SWEEP  (0 → 5 layers, ~12 s, unattended)'}
        </Text>
      </Pressable>

      {sweep.state.rows.length > 0 ? (
        <View style={styles.results}>
          <Text style={styles.mono}>{formatSweepTable(sweep.state.rows)}</Text>
          <Text style={[styles.verdict, VERDICT_STYLE[verdict.verdict]]}>
            {verdict.verdict.toUpperCase()}
            {verdict.budgetShare === null
              ? ''
              : `  —  blur is ${(verdict.budgetShare * 100).toFixed(1)}% of the budget at 2 layers`}
          </Text>
          <Text style={styles.p}>{verdict.sentence}</Text>
        </View>
      ) : null}

      <Section label="transition">
        {TRANSITIONS.map((name) => (
          <Chip key={name} on={transition === name} onPress={() => setTransition(name)}>
            {name}
          </Chip>
        ))}
      </Section>

      <Section label={`blur layers — ${String(layers)} (shuffle only; 0 is the flat-fill design)`}>
        {SWEEP_STEPS.map((n) => (
          <Chip key={n} on={layers === n} onPress={() => setBlurLayers(n)}>
            {String(n)}
          </Chip>
        ))}
      </Section>

      <Section label="speed scale">
        {SPEED_NAMES.map((name) => (
          <Chip key={name} on={speed === name} onPress={() => setSpeed(name)}>
            {`${name} ${String(durationOf('transition', SPEED_SCALES[name]))}ms`}
          </Chip>
        ))}
      </Section>

      <Section label={`reduce motion — system reports ${String(systemReduce)}`}>
        <Chip on={forceReduce} onPress={() => setForceReduce((v) => !v)}>
          {forceReduce ? 'forced on' : 'off'}
        </Chip>
      </Section>

      <TransitionStage
        name={transition}
        playToken={playToken}
        blurLayers={layers}
        reduceMotion={reduceMotion}
        loop={running}
      />

      <Pressable style={styles.replay} onPress={play}>
        <Text style={styles.replayText}>Replay once</Text>
      </Pressable>

      <Text style={styles.note}>
        {`transition token ${String(DURATIONS.transition)}ms at 1.0 · ` +
          `${String(durationOf('transition', SPEED_SCALES[speed]))}ms at ${speed}`}
      </Text>
    </ScrollView>
  );
}

const VERDICT_STYLE = {
  dead: { color: '#ff4757' },
  inconclusive: { color: '#ffb020' },
  'no-data': { color: '#838992' },
  'not-disproven': { color: '#3ddc97' },
} as const;

function Section({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({
  on,
  onPress,
  children,
}: {
  readonly on: boolean;
  readonly onPress: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  chipOn: { backgroundColor: '#ff6b35', borderColor: '#ff6b35' },
  chipText: { color: '#b6bcc4', fontSize: 13 },
  chipTextOn: { color: '#0e0f11', fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  content: { gap: 16, paddingBottom: 60, paddingHorizontal: 16, paddingTop: 56 },
  h1: { color: '#f2f3f5', fontSize: 20, fontWeight: '700' },
  label: {
    color: '#838992',
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  mono: {
    color: '#e4e7ea',
    fontFamily: 'monospace',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  note: { color: '#838992', fontSize: 11 },
  p: { color: '#9ba1aa', fontSize: 13, lineHeight: 19 },
  play: {
    alignItems: 'center',
    backgroundColor: '#ff6b35',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
  },
  playBusy: { backgroundColor: '#7a4426' },
  playText: { color: '#0e0f11', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  replay: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  replayText: { color: '#b6bcc4', fontSize: 14 },
  results: {
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  screen: { backgroundColor: '#0e0f11', flex: 1 },
  section: { gap: 4 },
  verdict: { fontSize: 15, fontWeight: '700' },
});
