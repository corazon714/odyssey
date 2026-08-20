import { useCallback, useState } from 'react';
import {
  Dimensions,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { readSystemTimeMs } from '../../src/clock/system-clock';

/**
 * `/dev/device-check` — the session steps that need a device but not a frame budget.
 *
 * Covers steps 1, 3, 5 and 10 of `docs/device-measurement-session.md` §9. Each one is a question
 * a browser cannot answer and CI cannot answer, and each is cheap enough that leaving it
 * unmeasured during a device session would be waste rather than economy.
 */

/** Time from bundle start, using the same source React Native itself stamped it with. */
function msSinceBundleStart(): number | null {
  const started = (globalThis as { __BUNDLE_START_TIME__?: number }).__BUNDLE_START_TIME__;
  if (typeof started !== 'number') return null;
  // `performance.now()` and `__BUNDLE_START_TIME__` read the same monotonic clock on RN, which is
  // why they can be subtracted. Deliberately NOT the wall clock: `Date.now()` is banned repo-wide
  // (CLAUDE.md rule 2.3) and mixing a monotonic start with a wall-clock end would be meaningless
  // anyway. `readSystemTimeMs` is used below only where an absolute time is genuinely wanted.
  return Math.round(performance.now() - started);
}

type Row = { readonly label: string; readonly value: string; readonly note?: string };

export default function DeviceCheck() {
  // Captured at module evaluation of this render, i.e. as close to first paint as a screen can get.
  const [coldStart] = useState(() => msSinceBundleStart());
  const [openedAt] = useState(() => readSystemTimeMs());
  const [blockResult, setBlockResult] = useState<string | null>(null);
  const [memory, setMemory] = useState<string | null>(null);

  // A continuously running UI-thread animation. If Reanimated's worklets really are off the JS
  // thread, this keeps moving while the button below blocks JS for 500ms.
  const spin = useSharedValue(0);
  useState(() => {
    spin.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
    return null;
  });
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateX: spin.value * 220 }] }));

  /**
   * STEP 5 — the UI-thread claim, tested rather than asserted.
   *
   * `docs/art-direction.md` §2 rejects a three.js render loop because it renders from the JS
   * thread, and the whole argument rests on Reanimated's worklets NOT being on that thread. On web
   * that claim is unfalsifiable (`docs/web-preview-traps.md` trap 8): there is no second thread to
   * lose. Here it is a binary observation — block JS hard and watch the bar.
   *
   * A busy loop rather than a timer, because a timer yields and would prove nothing.
   */
  const blockJs = useCallback(() => {
    const started = readSystemTimeMs();
    let spins = 0;
    while (readSystemTimeMs() - started < 500) spins += 1;
    setBlockResult(
      `blocked JS for ${String(readSystemTimeMs() - started)}ms (${String(spins)} spins) — ` +
        'if the bar kept moving, worklets are genuinely off the JS thread',
    );
  }, []);

  const readMemory = useCallback(() => {
    // `getInstrumentedStats` is a Hermes debug hook and is NOT guaranteed to exist. Windows has no
    // Instruments (docs/device-measurement-session.md §6), so this is the only route to a memory
    // figure from inside the app — and its absence is itself worth recording rather than crashing.
    const hermes = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => unknown } })
      .HermesInternal;
    const stats = hermes?.getInstrumentedStats?.();
    if (stats === undefined) {
      setMemory('HermesInternal.getInstrumentedStats is unavailable on this build');
      return;
    }
    const entries = Object.entries(stats as Record<string, unknown>)
      .filter(([k]) => k.toLowerCase().includes('heap') || k.toLowerCase().includes('alloc'))
      .map(([k, v]) => `${k}=${String(v)}`)
      .slice(0, 8);
    setMemory(entries.length > 0 ? entries.join('\n') : JSON.stringify(stats).slice(0, 400));
  }, []);

  const win = Dimensions.get('window');
  const scr = Dimensions.get('screen');
  const hermesPresent = (globalThis as { HermesInternal?: unknown }).HermesInternal !== undefined;

  // STEP 3 — Intl.PluralRules on Hermes. `docs/stack-notes.md` records that i18next's own docs say
  // Hermes lacks it and that Russian has four plural forms. Nothing is broken today because the
  // `en` locale has no plural keys; the first translated one is where it bites.
  const pluralRules = (Intl as { PluralRules?: unknown }).PluralRules;
  const pluralNote =
    pluralRules === undefined
      ? 'ABSENT — @formatjs/intl-pluralrules is required before the first plural key'
      : (() => {
          try {
            const pr = new Intl.PluralRules('ru');
            // Russian has four categories. one/few/many/other for 1 / 2 / 5 / 1.5.
            return `present — ru: 1=${pr.select(1)} 2=${pr.select(2)} 5=${pr.select(5)} 1.5=${pr.select(1.5)}`;
          } catch (e) {
            return `present but threw on ru: ${String(e)}`;
          }
        })();

  const rows: readonly Row[] = [
    { label: 'platform', value: `${Platform.OS} ${String(Platform.Version)}` },
    { label: 'JS engine', value: hermesPresent ? 'Hermes' : 'NOT Hermes (JSC or V8)' },
    {
      label: 'window (dp)',
      value: `${String(win.width)} x ${String(win.height)}`,
      note: 'the bake-off measured at 375 — compare',
    },
    { label: 'screen (dp)', value: `${String(scr.width)} x ${String(scr.height)}` },
    {
      label: 'pixel ratio',
      value: String(PixelRatio.get()),
      note: `physical ${String(Math.round(scr.width * PixelRatio.get()))} x ${String(Math.round(scr.height * PixelRatio.get()))}`,
    },
    {
      label: 'font scale',
      value: String(PixelRatio.getFontScale()),
      note: 'dynamic type — set it to 200% in Settings and come back',
    },
    {
      label: 'Intl.PluralRules',
      value: pluralRules === undefined ? 'ABSENT' : 'present',
      note: pluralNote,
    },
    {
      label: 'bundle -> this screen',
      value: coldStart === null ? 'unavailable' : `${String(coldStart)} ms`,
      note: 'DEV bundle — not a shipping cold start. Re-measure with --no-dev --minify.',
    },
    { label: 'opened at', value: String(openedAt), note: 'via the one sanctioned clock read' },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Device check — session steps 1, 3, 5, 10</Text>
      <Text style={styles.p}>
        Everything here is a question a browser and CI both answer wrongly. Record the values in
        docs/device-measurement-&lt;date&gt;.md.
      </Text>

      <View style={styles.results}>
        {rows.map((r) => (
          <View key={r.label} style={styles.row}>
            <Text style={styles.label}>{r.label}</Text>
            <Text style={styles.value}>{r.value}</Text>
            {r.note === undefined ? null : <Text style={styles.detail}>{r.note}</Text>}
          </View>
        ))}
      </View>

      <Text style={styles.section}>STEP 5 — is the animation really off the JS thread?</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.bar, barStyle]} />
      </View>
      <Pressable style={styles.play} onPress={blockJs}>
        <Text style={styles.playText}>BLOCK THE JS THREAD FOR 500ms — WATCH THE BAR</Text>
      </Pressable>
      {blockResult === null ? null : <Text style={styles.detail}>{blockResult}</Text>}

      <Text style={styles.section}>STEP 10 — memory, from inside the app</Text>
      <Pressable style={styles.secondary} onPress={readMemory}>
        <Text style={styles.secondaryText}>READ HERMES ALLOCATION STATS</Text>
      </Pressable>
      {memory === null ? null : <Text style={styles.mono}>{memory}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#ff6b35', borderRadius: 4, height: 8, width: 60 },
  content: { gap: 12, paddingBottom: 60, paddingHorizontal: 16, paddingTop: 56 },
  detail: { color: '#838992', fontSize: 11, lineHeight: 16 },
  h1: { color: '#f2f3f5', fontSize: 20, fontWeight: '700' },
  label: {
    color: '#838992',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  mono: { color: '#e4e7ea', fontFamily: 'monospace', fontSize: 11 },
  p: { color: '#9ba1aa', fontSize: 13, lineHeight: 19 },
  play: {
    alignItems: 'center',
    backgroundColor: '#ff6b35',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  playText: { color: '#0e0f11', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  results: {
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  row: { gap: 2 },
  screen: { backgroundColor: '#0e0f11', flex: 1 },
  secondary: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryText: { color: '#b6bcc4', fontSize: 13 },
  section: { color: '#f2f3f5', fontSize: 14, fontWeight: '700', marginTop: 6 },
  track: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    height: 8,
    overflow: 'hidden',
  },
  value: { color: '#e4e7ea', fontSize: 15, fontVariant: ['tabular-nums'] },
});
