import { evaluatePredicate } from '../predicate/evaluate-predicate.ts';
import { type PredicateContext } from '../predicate/predicate-context.ts';
import { type CheckTag } from './check-tag.ts';
import { DEFAULT_TUNABLES, mulDivRound, type ModifierTunables } from './modifier-tunables.ts';
import { type ModifierRegistry, type RegistryModifier } from './registry-modifier.ts';
import {
  type ModifierResolution,
  type ResolvedModifier,
  type SuppressedModifier,
} from './resolved-modifier.ts';

/**
 * The six-step modifier resolution pipeline.
 *
 * ORDER IS PART OF THE BALANCE CONTRACT, the same way the director's multiplication order is
 * (see `director/__tests__/scoring.test.ts`). Each step is ordered against a concrete
 * counterexample, pinned in `__tests__/modifier-order.test.ts`:
 *
 *   1+2 collect  — registry rows whose tags intersect and whose `when` passes, then the
 *                  choice's own modifiers. Order here does NOT reach the total, because step 5
 *                  sorts by magnitude; it only reaches chip order.
 *   3   conflict — BEFORE the non-stacking collapse. Otherwise a conflict declared against a
 *                  specific modifier silently retargets whichever one survived the collapse,
 *                  which is not what the author wrote. (A +3/-4 conflict pair with a +2
 *                  same-kind sibling totals -2 this way and -4 the other way. Both defensible;
 *                  this one preserves authored intent.)
 *   4   collapse — BEFORE diminishing returns, or DR is computed over entries about to be
 *                  deleted. Five +2s with three sharing a non-stacking kind: collapse-first
 *                  gives three entries and no DR at all.
 *   5   diminish — BEFORE the clamp, or the clamp produces non-integer per-entry shares for
 *                  DR to operate on.
 *   6   clamp    — last, with the reduction attributed back so the chips still sum to the
 *                  total.
 *
 * Everything is integer. See `modifier-tunables.ts` for why that is a replay requirement and
 * not a style preference.
 */

export type CheckLike = {
  readonly tags: readonly CheckTag[];
};

/** A choice-local modifier, already filtered by its own `when`. */
export type LocalModifier = {
  readonly id: string;
  readonly labelKey: string;
  readonly delta: number;
};

type Working = {
  readonly id: string;
  readonly labelKey: string;
  readonly rawDelta: number;
  readonly sourceKind: ResolvedModifier['sourceKind'];
  readonly priority: number;
  readonly stacks: boolean;
  readonly conflictsWith: readonly string[];
};

export function resolveModifiers(
  check: CheckLike,
  registry: ModifierRegistry,
  locals: readonly LocalModifier[],
  ctx: PredicateContext,
  tunables: ModifierTunables = DEFAULT_TUNABLES,
): ModifierResolution {
  const suppressed: SuppressedModifier[] = [];

  // ── 1. registry rows whose tags intersect and whose `when` passes ───────────────────────
  const collected: Working[] = [];
  for (const row of registry) {
    if (!appliesToCheck(row, check)) continue;
    // CONTENT-ADDRESSED path. Without it every `chance` gate in every modifier on this leg
    // would share one RNG address and return one answer — the bug this pipeline inherited
    // and fixes. Positional would be worse: inserting a row would shift every later gate.
    if (!evaluatePredicate(row.when, ctx, `m:${row.id}`).value) continue;
    collected.push({
      id: row.id,
      labelKey: row.labelKey,
      rawDelta: row.delta,
      sourceKind: row.sourceKind,
      priority: row.priority,
      stacks: row.stacks,
      conflictsWith: row.conflictsWith,
    });
  }

  // ── 2. the choice's own modifiers — exceptions, not the norm ────────────────────────────
  for (const local of locals) {
    collected.push({
      id: local.id,
      labelKey: local.labelKey,
      rawDelta: local.delta,
      sourceKind: 'context',
      // Beats a registry row it conflicts with: a modifier written onto this specific choice
      // is a deliberate override of the general rule.
      priority: Number.MAX_SAFE_INTEGER,
      stacks: true,
      conflictsWith: [],
    });
  }

  // ── 3. conflicts ────────────────────────────────────────────────────────────────────────
  const afterConflicts = resolveConflicts(collected, suppressed);

  // ── 4. non-stacking collapse, strongest per sourceKind ──────────────────────────────────
  const afterCollapse = collapseNonStacking(afterConflicts, suppressed);

  // ── 5 + 6. diminishing returns and the clamp, per sign, independently ───────────────────
  const positives = afterCollapse.filter((m) => m.rawDelta > 0);
  const negatives = afterCollapse.filter((m) => m.rawDelta < 0);

  const resolved = [...settle(positives, 1, tunables), ...settle(negatives, -1, tunables)];

  resolved.sort(byMagnitudeThenId);

  let total = 0;
  for (const modifier of resolved) total += modifier.delta;

  return { modifiers: resolved, total, suppressed };
}

function appliesToCheck(row: RegistryModifier, check: CheckLike): boolean {
  for (const tag of row.appliesTo) {
    if (check.tags.includes(tag)) return true;
  }
  return false;
}

/**
 * Higher `priority` wins; ties break on id so the outcome is a total function of the input
 * set. The M8 eviction lesson: a comparator that can tie is a comparator whose result depends
 * on input order.
 */
function resolveConflicts(
  working: readonly Working[],
  suppressed: SuppressedModifier[],
): readonly Working[] {
  const byId = new Map(working.map((m) => [m.id, m]));
  const dropped = new Set<string>();

  for (const modifier of working) {
    if (dropped.has(modifier.id)) continue;
    for (const otherId of modifier.conflictsWith) {
      const other = byId.get(otherId);
      if (other === undefined || dropped.has(other.id)) continue;
      const loser = beats(modifier, other) ? other : modifier;
      const winner = loser === modifier ? other : modifier;
      dropped.add(loser.id);
      suppressed.push({
        id: loser.id,
        labelKey: loser.labelKey,
        rawDelta: loser.rawDelta,
        reason: 'conflict',
        lostTo: winner.id,
      });
      if (loser === modifier) break;
    }
  }

  return working.filter((m) => !dropped.has(m.id));
}

function beats(a: Working, b: Working): boolean {
  if (a.priority !== b.priority) return a.priority > b.priority;
  return a.id < b.id;
}

function collapseNonStacking(
  working: readonly Working[],
  suppressed: SuppressedModifier[],
): readonly Working[] {
  const strongest = new Map<string, Working>();
  const kept: Working[] = [];

  for (const modifier of working) {
    if (modifier.stacks) {
      kept.push(modifier);
      continue;
    }
    const current = strongest.get(modifier.sourceKind);
    if (current === undefined) {
      strongest.set(modifier.sourceKind, modifier);
      continue;
    }
    const winner = stronger(current, modifier);
    const loser = winner === current ? modifier : current;
    strongest.set(modifier.sourceKind, winner);
    suppressed.push({
      id: loser.id,
      labelKey: loser.labelKey,
      rawDelta: loser.rawDelta,
      reason: 'non-stacking',
      lostTo: winner.id,
    });
  }

  return [...kept, ...strongest.values()];
}

function stronger(a: Working, b: Working): Working {
  const magA = Math.abs(a.rawDelta);
  const magB = Math.abs(b.rawDelta);
  if (magA !== magB) return magA > magB ? a : b;
  return a.id < b.id ? a : b;
}

/**
 * Diminishing returns then the clamp, for one sign.
 *
 * DR IS COMPUTED ONCE OVER THE TAIL SUM, not per entry, and that is a correctness fix rather
 * than a refinement. Per-entry `trunc(delta × 3/5)` truncates a `±1` to zero, and under
 * magnitude-descending ordering the `±1`s are exactly what lands in the tail — so four `+1`s
 * would total `+3` and eight `+1`s would ALSO total `+3`, making every modifier past the
 * third free in precisely the many-small-modifiers case DR exists to control.
 */
function settle(
  working: readonly Working[],
  sign: 1 | -1,
  tunables: ModifierTunables,
): readonly ResolvedModifier[] {
  if (working.length === 0) return [];

  const ordered = [...working].sort(byRawMagnitudeThenId);
  const head = ordered.slice(0, tunables.diminishAfter);
  const tail = ordered.slice(tunables.diminishAfter);

  const magnitudes = new Map<string, number>();
  for (const modifier of head) magnitudes.set(modifier.id, Math.abs(modifier.rawDelta));

  if (tail.length > 0) {
    let tailSum = 0;
    for (const modifier of tail) tailSum += Math.abs(modifier.rawDelta);
    const reduced = mulDivRound(tailSum, tunables.diminishNum, tunables.diminishDen);
    // Largest remainder, so the tail's shares sum to `reduced` exactly.
    for (const [id, share] of apportion(tail, reduced)) magnitudes.set(id, share);
  }

  let total = 0;
  for (const value of magnitudes.values()) total += value;

  const cap = sign === 1 ? tunables.maxBonus : tunables.maxPenalty;
  const capped = total > cap;
  if (capped) {
    for (const [id, share] of apportion(ordered, cap, magnitudes)) magnitudes.set(id, share);
  }

  return ordered.map((modifier): ResolvedModifier => {
    const magnitude = magnitudes.get(modifier.id) ?? 0;
    return {
      id: modifier.id,
      labelKey: modifier.labelKey,
      delta: magnitude * sign,
      rawDelta: modifier.rawDelta,
      sourceKind: modifier.sourceKind,
      diminished: tail.includes(modifier),
      capped: capped && magnitude !== Math.abs(modifier.rawDelta),
    };
  });
}

/**
 * Largest-remainder apportionment: split `target` across `items` in proportion to their
 * weights, using integers only, such that the shares sum to `target` EXACTLY.
 *
 * That exactness is the point. Design pillar 2 requires the player be able to reconstruct the
 * number, so the chips must sum to the total shown — a float-proportional split would not
 * reproduce bit-for-bit across engines, and trimming the smallest entries to fit would DELETE
 * chips, leaving a total nobody can rebuild from what is on screen.
 *
 * A share may legitimately land on 0 (`m=1, S=20, C=6`). There is deliberately no minimum of
 * 1, because a floor would break the sum guarantee; the chip renders as "0 (was −1, capped)".
 */
function apportion(
  items: readonly Working[],
  target: number,
  weights?: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const weightOf = (m: Working): number => weights?.get(m.id) ?? Math.abs(m.rawDelta);

  let sum = 0;
  for (const item of items) sum += weightOf(item);

  const out = new Map<string, number>();
  if (sum === 0) {
    for (const item of items) out.set(item.id, 0);
    return out;
  }

  const remainders: { readonly id: string; readonly rem: number; readonly weight: number }[] = [];
  let allocated = 0;

  for (const item of items) {
    const numerator = weightOf(item) * target;
    const share = (numerator - (numerator % sum)) / sum;
    out.set(item.id, share);
    allocated += share;
    remainders.push({ id: item.id, rem: numerator % sum, weight: weightOf(item) });
  }

  // Deterministic tiebreak all the way down: remainder, then weight, then id.
  remainders.sort((a, b) => {
    if (a.rem !== b.rem) return b.rem - a.rem;
    if (a.weight !== b.weight) return b.weight - a.weight;
    return a.id < b.id ? -1 : 1;
  });

  for (let i = 0; i < target - allocated; i += 1) {
    const entry = remainders[i];
    if (entry === undefined) break;
    out.set(entry.id, (out.get(entry.id) ?? 0) + 1);
  }

  return out;
}

function byRawMagnitudeThenId(a: Working, b: Working): number {
  const magA = Math.abs(a.rawDelta);
  const magB = Math.abs(b.rawDelta);
  if (magA !== magB) return magB - magA;
  if (a.sourceKind !== b.sourceKind) return a.sourceKind < b.sourceKind ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

function byMagnitudeThenId(a: ResolvedModifier, b: ResolvedModifier): number {
  const magA = Math.abs(a.delta);
  const magB = Math.abs(b.delta);
  if (magA !== magB) return magB - magA;
  return a.id < b.id ? -1 : 1;
}
