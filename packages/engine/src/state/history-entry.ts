import { type ChoiceId, type EventId } from '../ids/content-ids.ts';

/**
 * The run's narrative record: journal source, ending input, and the director's memory of
 * what it has recently shown.
 *
 * Text is stored as i18n KEYS plus params, never as rendered prose (CLAUDE.md 2.4). That is
 * what lets a saved run be re-read in a different language, and it means a removed event
 * degrades to a missing key at render time — which `i18n-check` catches — rather than to a
 * corrupt save.
 *
 * `tags` is denormalised from the event on purpose. The director's tag-saturation penalty
 * reads the last few entries every leg, and looking each event up in the content pack would
 * both cost more and behave differently after a content update. Copying the tags at fire
 * time makes the run's own history the source of truth for its own pacing.
 */
export type HistoryEntry = {
  readonly legIndex: number;
  readonly day: number;
  readonly eventId: EventId | null;
  readonly choiceId: ChoiceId | null;
  readonly textKey: string;
  readonly params: Readonly<Record<string, string | number | boolean>>;
  readonly tags: readonly string[];
};
