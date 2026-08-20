import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  createContentPack,
  createResources,
  createRunInit,
  createTransport,
  replayRun,
  type ChoiceId,
  type ContentRegistries,
  type GameEvent,
  type RouteState,
  type RunInit,
  type TransportMode,
} from '@odyssey/engine';
import fixture from '../../src/dev/__fixtures__/hermes-check.json';

/**
 * `/dev/hermes-check` — **the highest-value screen in this project's first device session.**
 *
 * ADR 0012 §3 has been open since Phase 1: the engine has never executed on Hermes. Every
 * determinism defence — no transcendentals, no `localeCompare`, integer `weightedPick`, `Math.imul`
 * over BigInt — is PREVENTIVE and demonstrated on V8 only, across Linux and Windows CI. A run must
 * be reproducible from `(seed, choiceSequence, contentVersion)`, and that claim has never been
 * tested on the engine the game actually ships on.
 *
 * Neither CI nor a browser can close it (`docs/web-preview-traps.md` trap 6). This screen can, and
 * it needs no Android and no special build — Expo Go runs Hermes.
 *
 * ## What a red result means, and what it does not
 *
 * **The fixture is self-certifying.** `pnpm hermes:fixture` replays every run on V8 and refuses to
 * write unless all nine digests reproduce. So a mismatch HERE means Hermes and V8 disagree — it
 * cannot mean the harness drifted, because a drifted harness fails at generation time on the
 * developer's machine, loudly, before anything ships.
 *
 * That property is the whole reason the generator exists rather than the fixture being copied.
 *
 * ## Why the digest is not the only comparison
 *
 * A digest is a hash of the final state, and two different journeys can arrive at the same numbers.
 * `historyKeys` is the SEQUENCE of what happened, so it catches a divergence that ends up in the
 * same place — a different event firing, a different outcome chosen, the same totals. `golden-run.
 * test.ts` makes the same argument for the same reason.
 */

type GoldenRun = {
  readonly seed: string;
  readonly routeId: string;
  readonly policy: string;
  readonly choiceSequence: readonly string[];
  readonly expectedDigest: string;
  readonly expectedHistoryKeys: readonly string[];
  readonly expectedLegs: number;
  readonly expectedEndings: readonly string[];
};

type RouteEntry = {
  readonly start: {
    readonly transportMode: string;
    readonly vehicleLegal: boolean;
    readonly cash: number;
    readonly startHour: number;
    readonly weather: string;
  };
  readonly route: RouteState;
};

type Fixture = {
  readonly contentVersion: string;
  readonly registries: ContentRegistries;
  readonly events: readonly GameEvent[];
  readonly routes: readonly RouteEntry[];
  readonly runs: readonly GoldenRun[];
};

const FIXTURE = fixture as unknown as Fixture;

type Outcome = {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
};

function runChecks(): readonly Outcome[] {
  const out: Outcome[] = [];
  const pack = createContentPack(FIXTURE.events, FIXTURE.registries);

  // The content version is part of the reproducibility triple, so a mismatch invalidates every
  // comparison below — report it as its own line rather than letting nine digests fail confusingly.
  out.push({
    label: 'contentVersion',
    ok: pack.version === FIXTURE.contentVersion,
    detail:
      pack.version === FIXTURE.contentVersion
        ? pack.version
        : `device ${pack.version} != fixture ${FIXTURE.contentVersion}`,
  });

  for (const run of FIXTURE.runs) {
    const label = `${run.routeId}/${run.policy}`;
    const entry = FIXTURE.routes.find((r) => String(r.route.id) === run.routeId);
    if (entry === undefined) {
      out.push({ label, ok: false, detail: 'route missing from fixture' });
      continue;
    }

    // Field for field as `golden-run.test.ts` builds it, and as the generator verified on V8.
    const init: RunInit = {
      ...createRunInit(run.seed, pack.version, entry.route),
      transport: {
        ...createTransport(entry.start.transportMode as TransportMode),
        vehicleId: `${String(entry.route.id)}-vehicle`,
        legal: entry.start.vehicleLegal,
      },
      resources: { ...createResources(), cash: entry.start.cash },
      startHour: entry.start.startHour,
      weather: entry.start.weather,
    };

    const result = replayRun(init, pack, run.choiceSequence as readonly ChoiceId[]);
    if (!result.ok) {
      out.push({ label, ok: false, detail: `replay failed: ${result.error.code}` });
      continue;
    }

    const digestOk = result.digest === run.expectedDigest;
    const legsOk = result.state.route.legIndex === run.expectedLegs;
    // The sequence, not just the destination: two different journeys can reach the same numbers.
    const keysOk =
      result.historyKeys.length === run.expectedHistoryKeys.length &&
      result.historyKeys.every((k, i) => k === run.expectedHistoryKeys[i]);
    const endingsOk =
      result.state.unlockedEndings.length === run.expectedEndings.length &&
      result.state.unlockedEndings.every((e, i) => String(e) === run.expectedEndings[i]);

    const ok = digestOk && legsOk && keysOk && endingsOk;
    out.push({
      label,
      ok,
      detail: ok
        ? `${result.digest} · ${String(result.historyKeys.length)} keys`
        : [
            digestOk ? null : `digest ${result.digest} != ${run.expectedDigest}`,
            legsOk
              ? null
              : `legs ${String(result.state.route.legIndex)} != ${String(run.expectedLegs)}`,
            keysOk ? null : 'history keys differ',
            endingsOk ? null : 'endings differ',
          ]
            .filter((x) => x !== null)
            .join(' · '),
    });
  }

  return out;
}

export default function HermesCheck() {
  const [results, setResults] = useState<readonly Outcome[] | null>(null);
  const [engine, setEngine] = useState<string>('');

  const run = useCallback(() => {
    // `HermesInternal` is a global Hermes injects. Its absence means JSC or V8 — which would make
    // a green result here evidence about the wrong engine, so it is reported rather than assumed.
    const hermes = (globalThis as { HermesInternal?: unknown }).HermesInternal;
    setEngine(
      hermes === undefined ? 'NOT HERMES — this result proves nothing about Hermes' : 'Hermes',
    );
    setResults(runChecks());
  }, []);

  const failed = results?.filter((r) => !r.ok).length ?? 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Hermes check — ADR 0012 §3</Text>
      <Text style={styles.p}>
        The engine has never run on Hermes. These are the nine golden runs, replayed here and
        compared digest for digest. The fixture was verified on V8 at generation time, so a mismatch
        means the two engines disagree — it cannot mean the harness drifted.
      </Text>

      <Pressable style={styles.play} onPress={run}>
        <Text style={styles.playText}>
          {results === null ? `REPLAY ${String(FIXTURE.runs.length)} GOLDEN RUNS` : 'REPLAY AGAIN'}
        </Text>
      </Pressable>

      {results !== null ? (
        <>
          <Text style={[styles.verdict, failed === 0 ? styles.good : styles.bad]}>
            {failed === 0
              ? `ALL ${String(results.length)} CHECKS PASS — the engine is deterministic on this runtime`
              : `${String(failed)} of ${String(results.length)} FAILED`}
          </Text>
          <Text style={[styles.p, engine.startsWith('NOT') && styles.bad]}>engine: {engine}</Text>
          <View style={styles.results}>
            {results.map((r) => (
              <View key={r.label} style={styles.row}>
                <Text style={[styles.mark, r.ok ? styles.good : styles.bad]}>
                  {r.ok ? 'PASS' : 'FAIL'}
                </Text>
                <View style={styles.rowBody}>
                  <Text style={styles.label}>{r.label}</Text>
                  <Text style={styles.detail}>{r.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.note}>
        Record the result in docs/device-measurement-&lt;date&gt;.md. A pass closes a gap open since
        Phase 1; a failure is the most important bug this project has.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bad: { color: '#ff4757' },
  content: { gap: 14, paddingBottom: 60, paddingHorizontal: 16, paddingTop: 56 },
  detail: { color: '#838992', fontFamily: 'monospace', fontSize: 11 },
  good: { color: '#3ddc97' },
  h1: { color: '#f2f3f5', fontSize: 20, fontWeight: '700' },
  label: { color: '#e4e7ea', fontSize: 13 },
  mark: { fontSize: 11, fontWeight: '700', width: 38 },
  note: { color: '#838992', fontSize: 11, lineHeight: 16 },
  p: { color: '#9ba1aa', fontSize: 13, lineHeight: 19 },
  play: {
    alignItems: 'center',
    backgroundColor: '#ff6b35',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 52,
  },
  playText: { color: '#0e0f11', fontSize: 14, fontWeight: '700' },
  results: {
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  row: { flexDirection: 'row', gap: 8 },
  rowBody: { flex: 1, gap: 2 },
  screen: { backgroundColor: '#0e0f11', flex: 1 },
  verdict: { fontSize: 15, fontWeight: '700' },
});
