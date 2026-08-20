import { collectFlagUsage, collectRefs, type Effect } from '@odyssey/engine';
import { error, warn, type LintIssue } from './issue.ts';
import { type ContentBundle } from './load-content.ts';

/**
 * Undeclared references, orphan flags, and the item-liability rule.
 *
 * ADR 0001 accepts that content bugs in a quality-based narrative are SILENT: an event whose
 * `requires` names an npc that no longer exists simply never fires, and nothing errors. These
 * rules are the instrument for that class, and the orphan check is the one engine-spec §3
 * singles out.
 */

/** Every referenced id must be declared. An undeclared reference is silently inert. */
export function undeclaredReferences(bundle: ContentBundle): readonly LintIssue[] {
  const issues: LintIssue[] = [];
  const declared = {
    npc: new Set<string>(bundle.declarations.npcs.map((d) => d.id)),
    item: new Set<string>(bundle.declarations.items.map((d) => d.id)),
    trait: new Set<string>(bundle.declarations.traits.map((d) => d.id)),
    ending: new Set<string>(bundle.declarations.endings.map((d) => d.id)),
    flag: new Set<string>(bundle.declarations.flags.map((d) => d.id)),
  };
  const events = new Set<string>(bundle.events.map((e) => e.id));

  for (const ref of collectRefs(bundle.events, bundle.modifiers)) {
    const known = ref.kind === 'event' ? events.has(ref.id) : declared[ref.kind].has(ref.id);
    if (known) continue;
    issues.push(
      error(
        `UNDECLARED_${ref.kind.toUpperCase()}`,
        fileFor(bundle, ref.inEvent),
        `${ref.kind} \`${ref.id}\` is referenced by ${ref.inEvent} but never declared`,
      ),
    );
  }

  const usage = collectFlagUsage(
    bundle.events,
    bundle.modifiers,
    bundle.universalChoices,
    bundle.complications,
  );
  for (const id of [...usage.written, ...usage.read]) {
    if (declared.flag.has(id)) continue;
    issues.push(error('UNDECLARED_FLAG', 'flags.yaml', `flag \`${id}\` is used but not declared`));
  }

  for (const id of endingsUnlocked(bundle)) {
    if (declared.ending.has(id)) continue;
    issues.push(
      error('UNDECLARED_ENDING', 'endings.yaml', `ending \`${id}\` is unlocked but not declared`),
    );
  }

  return issues;
}

/**
 * ORPHAN DETECTION — engine-spec §3 calls this the number one content bug.
 *
 * A flag written and never read is a dead write: the author believed something downstream
 * cared. A flag read and never written is worse — the gate can never open, so the event
 * behind it never fires and nothing errors anywhere.
 *
 * The honest limit, stated because a linter that overclaims is worse than one that does not
 * run: this is STATIC. A flag written only on an outcome nobody ever reaches reads as
 * perfectly healthy here. Only the sim's runtime instrument sees that, and it already reports
 * it — these two checks exist to make that report rare, not to replace it.
 */
export function orphanFlags(bundle: ContentBundle): readonly LintIssue[] {
  const usage = collectFlagUsage(
    bundle.events,
    bundle.modifiers,
    bundle.universalChoices,
    bundle.complications,
  );
  const declared = new Set<string>(bundle.declarations.flags.map((d) => d.id));

  return [
    ...usage.readNeverWritten.map((id) =>
      error(
        'FLAG_READ_NEVER_WRITTEN',
        'flags.yaml',
        `flag \`${id}\` gates something but nothing ever sets it — that gate can never open`,
      ),
    ),
    ...usage.writtenNeverRead.map((id) =>
      warn(
        'FLAG_WRITTEN_NEVER_READ',
        'flags.yaml',
        `flag \`${id}\` is set but nothing reads it — a dead write, or a missing gate`,
      ),
    ),
    ...[...declared]
      .filter((id) => !usage.written.includes(id) && !usage.read.includes(id))
      .map((id) =>
        warn(
          'FLAG_DECLARED_UNUSED',
          'flags.yaml',
          `flag \`${id}\` is declared but neither written nor read`,
        ),
      ),
  ];
}

/**
 * THE ITEM LIABILITY RULE, made decidable.
 *
 * "Every item must be capable of being a liability as well as an asset" is not statically
 * checkable — whether an outcome is BAD is a judgement about semantics, not a property of the
 * content graph. So the judgement sits with the author at declaration time (`liability:` names
 * the events where carrying it hurts) and this checks the two things it actually can: that the
 * events exist, and that they really do read the item.
 *
 * An item with no liability is not an item. It is a number.
 */
export function itemLiability(bundle: ContentBundle): readonly LintIssue[] {
  const issues: LintIssue[] = [];
  const byId = new Map(bundle.events.map((e) => [String(e.id), e]));

  for (const item of bundle.declarations.items) {
    for (const eventId of item.liability) {
      const event = byId.get(String(eventId));
      if (event === undefined) {
        issues.push(
          error(
            'LIABILITY_UNKNOWN_EVENT',
            'items.yaml',
            `\`${item.id}\` names liability event \`${String(eventId)}\`, which does not exist`,
          ),
        );
        continue;
      }
      const reads = collectRefs([event]).some(
        (ref) => ref.kind === 'item' && ref.id === String(item.id),
      );
      if (!reads) {
        issues.push(
          warn(
            'LIABILITY_UNBACKED',
            'items.yaml',
            `\`${item.id}\` names \`${String(eventId)}\` as a liability, but that event never reads the item`,
          ),
        );
      }
    }
  }

  return issues;
}

function endingsUnlocked(bundle: ContentBundle): readonly string[] {
  const out = new Set<string>();
  const walk = (effect: Effect): void => {
    if (effect.op === 'unlockEnding') out.add(String(effect.id));
  };
  for (const event of bundle.events) {
    for (const choice of event.choices) {
      for (const cost of choice.costs) walk(cost);
      for (const outcome of choice.outcomes) outcome.effects.forEach(walk);
    }
  }
  return [...out];
}

/** Best-effort path for a finding attributed to an event or a modifier. */
export function fileFor(bundle: ContentBundle, source: string): string {
  if (source.startsWith('modifier:')) return 'modifiers.yaml';
  const event = bundle.events.find((e) => String(e.id) === source);
  if (event === undefined) return 'events';
  const [category, ...rest] = String(event.id).split('.');
  return `events/${String(category)}/${rest.join('_')}.yaml`;
}
