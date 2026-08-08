import {
  type EndingId,
  type EventId,
  type FlagId,
  type NpcId,
  type TraitId,
} from '../ids/content-ids.ts';
import { type RngCursors } from '../rng/rng-cursors.ts';
import { type ClockState } from './clock-state.ts';
import { type DocumentsState } from './documents-state.ts';
import { type HistoryEntry } from './history-entry.ts';
import { type EventMemoryEntry, type FlagEntry, type RelationshipEntry } from './memory-entries.ts';
import { type InventoryState } from './container-state.ts';
import { type PendingEvent } from './pending-event.ts';
import { type Presentation } from './presentation.ts';
import { type Resources } from './resources.ts';
import { type RouteState } from './route-state.ts';
import { type RunStatus } from './run-status.ts';
import { type Skills } from './skills.ts';
import { type TransportState } from './transport-state.ts';

/**
 * The complete state of one run. Everything about a run is reproducible from
 * `(seed, choiceSequence, contentVersion)`, and this is what those three reproduce.
 *
 * TWO HOUSE RULES BIND EVERY TYPE REACHABLE FROM HERE.
 *
 * 1. **No optional properties. Use `| null`.** `exactOptionalPropertyTypes` makes
 *    `{ ...state, x: maybeUndefined }` an error wherever `x?: T`, which is precisely what a
 *    structural-sharing effect applier does on every leg. And `undefined` does not survive
 *    `JSON.stringify` while `null` does, so an optional field silently changes shape on save
 *    and reload. Authored CONTENT types keep `?`, because omission is natural in YAML.
 *
 * 2. **No functions, Maps, Sets, Dates or class instances** (engine-spec 1). Save, load and
 *    golden-run replay are all built on the assumption that
 *    `JSON.parse(JSON.stringify(state))` is the identity. `json-serializable.test.ts`
 *    enforces it at the only point where it can actually be checked.
 *
 * `version` and `contentVersion` are two INDEPENDENT axes with opposite policies: the save
 * schema migrates through ordered pure functions, while a content-pack change cannot be
 * migrated and is reconciled by tolerant read. See the M11 brief.
 */
export type RunState = {
  readonly version: number;
  readonly contentVersion: string;
  readonly seed: string;
  readonly rngCursors: RngCursors;

  readonly clock: ClockState;
  readonly weather: string;

  readonly route: RouteState;
  readonly transport: TransportState;
  readonly resources: Resources;
  readonly skills: Skills;

  readonly traits: readonly TraitId[];
  readonly inventory: InventoryState;
  readonly documents: DocumentsState;

  // ── memory: four mechanisms, deliberately not one (ADR 0001) ──────────────
  readonly flags: Readonly<Record<FlagId, FlagEntry>>;
  readonly relationships: Readonly<Record<NpcId, RelationshipEntry>>;
  readonly eventMemory: Readonly<Record<EventId, EventMemoryEntry>>;
  readonly pendingEvents: readonly PendingEvent[];
  // ──────────────────────────────────────────────────────────────────────────

  readonly history: readonly HistoryEntry[];
  /** 0-1 director pacing signal. */
  readonly tension: number;
  readonly unlockedEndings: readonly EndingId[];
  readonly status: RunStatus;
  readonly presentation: Presentation;
};
