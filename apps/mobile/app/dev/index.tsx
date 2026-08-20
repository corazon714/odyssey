import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * `/dev` — the session's running order, as the screen you actually start from.
 *
 * `docs/device-measurement-session.md` §9 orders the steps so that the cheapest thing that can
 * invalidate the session happens first, and so the irreversible-looking results come before the
 * ones needing judgement and a fresh eye. That order is reproduced here rather than left in a
 * document nobody will have open while holding a phone.
 */

const STEPS = [
  {
    href: '/dev/hermes-check' as const,
    steps: 'step 2',
    title: 'Hermes check',
    body:
      'Nine golden runs replayed and compared digest for digest. ADR 0012 §3 has been open since ' +
      'Phase 1 — the engine has never executed on Hermes. THE HIGHEST-VALUE ITEM HERE, and it has ' +
      'nothing to do with the art direction.',
  },
  {
    href: '/dev/device-check' as const,
    steps: 'steps 1, 3, 5, 10',
    title: 'Device check',
    body:
      'Dimensions, pixel ratio and font scale · Intl.PluralRules on Hermes · the UI-thread claim ' +
      'tested by blocking JS for 500ms · cold start and Hermes allocation stats.',
  },
  {
    href: '/dev/motion-lab' as const,
    steps: 'steps 4, 6, 7, 8',
    title: 'Motion lab',
    body:
      'The blur sweep, 0 → 5 layers unattended, and the direction-E verdict computed on-device. ' +
      'A failure here KILLS E; a pass is not a pass — see the session doc §1.',
  },
] as const;

export default function DevIndex() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Device measurement session</Text>
      <Text style={styles.p}>
        Run these in order. Record everything — including the steps that could not be run — in
        docs/device-measurement-&lt;date&gt;.md. A session that reports what it could not do is a
        successful one.
      </Text>

      {STEPS.map((s) => (
        <Link key={s.href} href={s.href} asChild>
          <View style={styles.card}>
            <Text style={styles.steps}>{s.steps}</Text>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        </Link>
      ))}

      <Text style={styles.note}>
        Steps 9 (type and touch targets in the hand) and the reduce-motion pass live inside the
        motion lab. Nothing here needs Android; nothing here needs a dev build.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { color: '#9ba1aa', fontSize: 12.5, lineHeight: 18 },
  card: {
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  content: { gap: 12, paddingBottom: 60, paddingHorizontal: 16, paddingTop: 56 },
  h1: { color: '#f2f3f5', fontSize: 20, fontWeight: '700' },
  note: { color: '#838992', fontSize: 11, lineHeight: 16 },
  p: { color: '#9ba1aa', fontSize: 13, lineHeight: 19 },
  screen: { backgroundColor: '#0e0f11', flex: 1 },
  steps: {
    color: '#ff6b35',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: { color: '#f2f3f5', fontSize: 16, fontWeight: '700' },
});
