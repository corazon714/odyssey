# Content style guide

> How to author for Odyssey. Read `CLAUDE.md` §9 (the content model), §10 (design pillars) and
> §11 (safety) first — this is the working document that sits under them.
>
> The single question this guide exists to answer is **"does this belong in an event, or in a
> registry?"** Everything else follows from getting that right.

---

## 1. The rule that matters most

**A small corpus multiplied by registries beats a large corpus.**

Twelve events played straight are twelve situations. Twelve events crossed with twenty-five
complications, fifteen universal choices and a hundred and sixty modifiers are a play space you
cannot enumerate — and the authoring cost is the registries, paid once, not the cross product.

So the instinct to fix a problem by editing an event is usually wrong. Before you add anything
to a `.yaml` under `events/`, ask which of these it actually is:

| If the thing you want to say is…                       | It belongs in            |
| ------------------------------------------------------ | ------------------------ |
| "this kind of contest is harder when the player is X"  | `modifiers.yaml`         |
| "this kind of situation sometimes also has X going on" | `complications.yaml`     |
| "you should always be able to try X here"              | `universal-choices.yaml` |
| "**this** particular moment, and no other**"**         | the event                |

The failure mode has a name and a linter rule. A modifier hand-written onto a choice is
`LOCAL_MODIFIER` (an **error**), because the same "you look like you slept in a ditch" penalty
copied into forty social events drifts in value between them and cannot be changed at all. The
authoring schema makes you write `why:` next to a local modifier precisely so the exception
carries its own argument.

**When a local modifier is right:** the modifier is genuinely about this one event and no
other, and you can say so in one line. That is rare. Expect to write fewer than one per ten
events.

---

## 2. Events

### Ids are permanent

`category.snake_case`, namespaced by category, and **never renamed** (`CLAUDE.md` §6). An id
appears in save files, in `eventMemory`, in `scheduleEvent` windows and in the golden runs. A
rename is a data migration, not an edit. Deprecate instead.

The directory is not the category — `category:` is a field, and the loader reads it. Keep them
matching anyway; `fileFor` in the linter assumes it when it points at a file.

### `weight` is relative, not absolute

`weight` is the base likelihood before the director's six scoring factors multiply it. The
default is 100. Reach for a different number only when you can say what it is relative _to_;
"this should be rarer than a filler" is a reason, "this feels like a 60" is not.

The scoring factors already handle novelty, recency, tension fit and tag saturation. **Do not
try to encode pacing in `weight`** — you will be fighting the director, and the sim will show
it as a distribution nobody intended.

### `requires` gates, `tensionBand` nudges

`requires` is a hard gate: false means the event cannot fire, ever, on that leg. `tensionBand`
is a _scoring factor_ — an event outside its band is less likely, not excluded (ADR 0005 §5).
If you find yourself wanting a hard tension gate, you almost certainly want `requires` with a
`{ tension: true, gte: N }` node and should say so explicitly.

**The most common authoring bug is a `requires` nothing can satisfy**, and it is silent: the
event just never fires. `CONTRADICTORY_REQUIRES_NUMERIC` catches the decidable fragment
(numeric intervals inside an `all`); the sim's never-fired list catches the rest. Check both.

### `context` — empty means ANY

`locationTypes: []` is "anywhere", not "nowhere". This is the opposite of `appliesTo` on a
registry row, where empty matches nothing. The asymmetry is deliberate: the common case for an
event is unconstrained, and the common case for a registry row is targeted.

### Text budgets, enforced

Design pillar 5: body **≤ 60 words**, each choice label **≤ 8 words**. `BODY_TOO_LONG` and
`CHOICE_TOO_LONG` are warnings, and they only run once `i18n/en/` exists — so they are silent
right up until the moment you write the strings, and then they arrive all at once.

Write to the budget from the start. This is a phone game read in fifteen seconds.

### Memory: pick the right mechanism

Four exist and collapsing them into flags is the named anti-pattern (a 400-flag system is
unmanageable, engine-spec §3):

| Mechanism                               | Use it for                                                              |
| --------------------------------------- | ----------------------------------------------------------------------- |
| **flag**                                | durable world state many later events gate on (`wanted`, `papers_lost`) |
| **relationship**                        | one NPC's standing attitude                                             |
| **eventMemory** (`eventSeen`)           | "you have been here before" — variant text, novelty scoring             |
| **consequence queue** (`scheduleEvent`) | a promise to pay off later, in a leg window                             |

Every flag must be **declared** in `flags.yaml` with a description and a lifetime, and every
declared flag must be both written and read by something. `FLAG_READ_NEVER_WRITTEN` is an
**error** — a gate nothing can open means the branch behind it is dead. `FLAG_WRITTEN_NEVER_READ`
is a warning, and it means either a dead write or a gate you forgot.

### `scheduleEvent` is a request, never an edge

The one sanctioned soft pointer (`CLAUDE.md` rule 2.1). You write `inLegs: [4, 12]` — a window
of leg _offsets_ — and the director may decline. Author the target so it can plausibly fire
inside that window: the Phase 1 fixture scheduled a payoff twenty times and fired it zero,
because the window contained exactly one leg whose location could host it.

**There is no `nextEventId` and the schema will not let you invent one** — event files are
`z.strictObject`, so an unknown key fails the parse.

---

## 3. Checks

### Tag the broad tag AND the flavour

A bribe is `[social, bribery, authority, crime]`, not `[bribery]`. The registry keys on tag
intersection, so narrow tags draw nothing and the failure is **silent** — the check still
rolls, it just has no modifiers. Two linter rules catch it:

- `MISSING_CHECK_TAGS` (**error**) — the tag your skill implies is missing.
  `negotiation→social`, `stealth→stealth`, `mechanics→mechanics`, `streetwise→crime`,
  `endurance→endurance`.
- `STARVED_CHECK` (**error**) — the tags match zero registry rows.

Only five skills exist. The other thirteen check tags — `luck`, `medical`, `language`,
`search`, `documents`, `perception`, `navigate`, `haggle`, `deception`, `intimidate`,
`authority`, `bribery`, `physical` — are reachable **only** by tagging them explicitly
alongside the skill's implied tag.

### DCs, and the number that decides everything

`d20 + skill + clamp(modifiers, −8..+6)` against a fixed `dc`. **The skill bypasses the clamp**;
situational modifiers do not.

One modifier point is worth 5 percentage points. The whole registry can move a check by at most
30/40 points. A skill point is worth as much as a modifier point and is uncapped.

> `CHECK_DIE_SIDES = 20` is still a **placeholder** and changing it invalidates every DC ever
> authored (PROGRESS open question 2). Until it is settled, keep DCs in a narrow band (10–16)
> so a re-tune is arithmetic rather than a rewrite.

### A search is a check

`search:` is a **sibling of `check:`**, never both — a choice rolls one thing, and `onCheck`
branches on whichever it has. **Success means it stayed hidden**; `onCheck: failure` is the
outcome where they find it. That direction is forced by the sign convention in
`modifiers.yaml`, where `cash_concealed` is +2 and `wanted_by_authorities` is −3, both from the
player's side. See ADR 0020.

---

## 4. Modifiers (`modifiers.yaml`)

### The non-stacking collapse shapes the whole registry

`stacks` defaults to **false**, and every non-stacking row sharing a `sourceKind` collapses to
**exactly one survivor per check** — the largest `|delta|`, ties by id ascending. Priority does
**not** decide this; it decides conflicts only.

Two consequences you must author around:

1. **Breadth comes from across the twelve `sourceKind`s, not from many rows within one.** A
   check pulling 3–7 modifiers is pulling them from 3–7 different kinds.
2. **Rows in one kind are alternative gradations of one idea.** `exhausted` and `running_on_fumes`
   are two rungs of the same meter and should collapse to the worse one. Two genuinely
   independent pressures in the same kind will silently suppress each other.

Use `stacks: true` only when the pressures are independent and you want them to add
(`wanted_by_authorities` is the model). Write `stacks:` explicitly every time — an omitted key
is the highest-risk default in the schema.

### Priority ladder in use

20 presentation · 30 place · 40 language/skill · 45–55 money and relationship · 60–65 heat and
flags · 70 items and countermeasures · 80 complications. Higher wins a `conflictsWith`.

### `labelKey` is derived — never write it

`check.modifier.<id>`, asserted by a test. The id is also the RNG address for any `{ chance }`
inside `when`, which is why ids are content-addressed rather than positional.

### Two `sourceKind`s have no state behind them yet

- **`region`** — `RunState` has **no current region**, and the only predicate taking a
  `RegionId` is `{ visa: <region> }`, which needs a literal id. A global row cannot ask "do you
  have a visa for where you are". Worse, naming a real region in a penalty row is exactly what
  §11 forbids. **A `region` row may only encode the player's PAPER STATUS**, via flags a border
  event sets. It never names a place and never carries a place's character.
- **`companion`** — there is no companion field in `RunState`; preparation is Phase 3.
  Companion rows key on flags (`companion_present`, `companion_local`, …) that content sets
  today and a preparation screen will set later. Do not look for `state.companion`.

Both are recorded as open questions rather than worked around silently.

---

## 5. Complications (`complications.yaml`)

**A complication must change what the player DOES.** The schema rejects a row that neither adds
nor removes a choice: a numbers-only complication is a modifier wearing a sentence, and it
belongs in `modifiers.yaml`, which applies by check tag and costs nothing per event.

- `textKey` is a **separate sentence appended to the body**, never interpolated into it. The
  clause would otherwise have to agree grammatically with a sentence written in four languages,
  and the body's translator cannot see what will be spliced in.
- `checkDelta`, not a DC change. It enters the modifier pipeline as a synthetic `context` row so
  it is clamped, collapsed and rendered as a chip. **Sign follows the roll — harder is
  negative.** Zero is rejected.
- At most **one per event**. `ATTACH_PERCENT` (60) decides whether one attaches at all; `weight`
  decides which. Keep those two jobs separate.
- `appliesTo` matches `tagsOf(event)` — the event's tags **plus** `cat:<category>`. Empty
  matches nothing.

---

## 6. Universal choices (`universal-choices.yaml`)

**The hard rule: a universal choice must never be strictly the best option.** If it is, every
hand-authored choice in every matching event becomes pointless and the corpus collapses to
fifteen buttons.

Every row carries a real cost — heat, morale, cash, time, a flag, or a burned relationship —
paid **whether or not it works**. State the cost in a comment above the row. The schema rejects
a row with no costs, no roll and no effects; a roll counts as a cost, because risk is one. The
rest is review.

Injection, all enforced in the engine:

- at most **3** per event, and **never more than the event authored itself** (`i ≤ a`)
- at most one row per `family`
- ordered `(-priority, id ascending)`, always **after** the hand-authored choices

### `appliesTo` breadth is a cost, not a benefit

**The single most counter-intuitive thing in this file**, learned by writing the first fifteen
rows: three of them were dead on arrival, and the cause was structural rather than a typo.

With a 3-per-event cap and one row per family, a row that is both **low priority and broadly
targeted never lands anywhere.** It loses its family contest wherever it matches, and loses the
cap where it does not. Widening `appliesTo` to "make sure it gets used" produces the opposite.

Raising its priority does not fix it either — that only moves the problem to whoever gets
displaced. **Make each row in a family target a different kind of event and win there**, so the
family cap arbitrates between genuinely competing options rather than between a good row and a
broad one.

And check that a family is really a family. `create_a_distraction` and `offer_to_work_for_it`
shared one, which made the cheaper permanently unreachable — a distraction and a day's labour
are not two ways of doing the same thing.

`UNIVERSAL_NEVER_INJECTED` is the running check, and it runs the **real** splice rather than a
copy of its logic. Trust it over your reading of the priorities.

### A caller that renders choices must use `presentedChoices`

Not `event.choices`. A complication can REMOVE a choice, so the two lists differ, and
`resolveChoice` will refuse an id that is not in the presented list — correctly, because
CLAUDE.md 2.7 makes the engine the authority on legality rather than the screen. The sim learned
this the expensive way: 2000 runs of `loop/unknown-choice`.

---

## 7. i18n

### Keys are derived; there are no text fields

| What               | Key                                                                  |
| ------------------ | -------------------------------------------------------------------- |
| event title / body | `events.<eventId>.title` / `.body`                                   |
| choice label       | `events.<eventId>.choice.<choiceId>`                                 |
| outcome text       | `events.<eventId>.out.<outcomeId>`                                   |
| outcome variants   | `…out.<outcomeId>.v1`, `.v2` (from `variants: 2`)                    |
| universal choice   | `universal.<rowId>.label`, `universal.<rowId>.out.<outcomeId>`       |
| complication       | `complication.<rowId>.text`, `…choice.<id>`, `…choice.<id>.out.<id>` |
| modifier chip      | `check.modifier.<id>`                                                |

Registry keys derive from the **row**, not the event they land in. That is what makes a
universal choice cost one translation instead of one per matching event.

Explicit `labelKey` / `textKey` are an escape hatch, and they must still be i18n keys — a
round-trip test asserts no prose can appear in a `.yaml`. Use one only when the derived key
reads badly to a translator (`out.onward_again` beats `out.onward.v2`).

### The locale is a cliff, not a slope

`MISSING_I18N_KEY` is an **error** and it fires **per key** the moment `i18n/en/` contains any
`.json` at all. Landing half a locale turns one `MISSING_LOCALE` warning into hundreds of
errors. Write it complete, in one commit, or write it last.

Creating `en/` also switches on the word-count rules and the four §11 safety scans for the
first time.

---

## 8. Safety (`CLAUDE.md` §11), in practice

**Geography is real; character is not.** The map uses real cities, coordinates, distances,
borders and ports — that is a feature. What is banned is attaching danger, corruption or
behaviour to a named real place or people.

- An event fires at **"a border crossing"**, never at a named country's border.
- Difficulty comes from the route **profile** (illicit, night crossing, missing documents) and
  the player's **state** (heat, reputation, resources) — never from where they are.
- NPCs are **archetypes**: `border_guard`, `roadside_mechanic`, `fixer`. Never a nationality,
  never a real person.
- No real-world actionable instruction: forgery methods, evading specific controls, concealment
  or synthesis technique.
- No minors in danger, no sexual content, no graphic torture, no real brands or institutions.

The `SAFETY_*` linter rules scan the **locale**, not the YAML, because that is the only place
prose lives. They are warnings on purpose: these patterns are false-positive-prone, and a §11
check that fails CI on "Turkish coffee" gets suppressed, which is strictly worse than no check.

**When in doubt, do not guess** — flag it for human review rather than shipping it.

---

## 9. Before you commit

```bash
pnpm content:lint     # errors block; read the warnings, they are real findings
pnpm content:stats    # counts and the 4-axis coverage pass
pnpm test             # round-trip, declarations, registries
```

**Write three, lint, then write the rest.** `CLAUDE.md` §8 makes this a rule for a reason: a
mistake in the first event is a mistake in all twelve, and the linter finds it in three seconds.

Two coverage thresholds to author against, both warnings:

- every check tag used by **≥ 3 events** (`THIN_TAG`)
- every check tag covered by **≥ 5 modifiers** (`THIN_TAG`)

Eighteen tags × 3 events is 54 tag-event slots. With ~12 events at ~10 slots each that is
feasible, but only if you plan the tag spread deliberately rather than tagging each check by
instinct and hoping.
