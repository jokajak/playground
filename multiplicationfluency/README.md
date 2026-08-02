# Multiplication Fluency

A spaced-repetition drill for the times tables where **speed is the goal**.
Getting an answer right is not enough: a fact only counts once you can recall
it in under three seconds, and that fluency is what drives the schedule, the
progress colours, and the animals you collect. No server, no build step, no
accounts — everything lives in the browser's local storage.

## Use it

**https://jokajak.github.io/playground/multiplicationfluency/**

## How to run locally

Static files, no build step — serve the directory (the page loads
`src/app.js`, so `file://` won't work in every browser):

```sh
cd multiplicationfluency
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## How to use

1. Pick the **times tables** to work on, and the range of second factors
   (defaults to the 2–12 tables times 1–12).
2. Choose **Spaced repetition** — the queue is built from facts that are due
   for review plus a capped number of new ones — or **Free drill** for plain
   random questions over everything selected.
3. Pick a **session length**: a timed sprint, a fixed number of questions, or
   endless until you stop.
4. Answer with the keyboard or the on-screen keypad. **Enter** submits,
   **Backspace** deletes, **Esc** ends the session.
5. Beat the green bar under each question — it drains over three seconds, and
   answering before it empties is what counts as a fluent answer.
6. The summary leads with how many answers were fluent, then accuracy, median
   time, misses, facts that were right but too slow, and any animals earned.

## Fluency is the goal

Every answer is timed, and the timing decides what happens next:

| Answer | Counts as | Effect |
|---|---|---|
| Under 1.5s | *easy* | Fluent. Biggest jump in the schedule. |
| Under 3s | *good* | Fluent. Normal schedule growth. |
| Over 3s | *hard* | **Not fluent.** The fact is scheduled *sooner*, not later. |
| Wrong | *again* | Back to learning, repeated later in the same session. |

Because slow answers shrink the interval instead of growing it, you cannot
grind your way to mastery by working answers out — only by knowing them.

A fact is **fluent** once it is out of the learning phase and has been answered
correctly and quickly **three times in a row** (with its running average still
inside three seconds). One slow or wrong answer resets that streak.

## Animals

Fluency earns animals, and the full ladder is visible from the start — every
locked animal shows exactly what it costs, with a progress bar to the next one,
and the next reward is shown during the drill and on the summary.

**Companions** hatch as your total of fluent facts grows:

| Fluent facts | Animal | | Fluent facts | Animal |
|---|---|---|---|---|
| 1 | 🐣 Chick | | 45 | 🐧 Penguin |
| 3 | 🐹 Hamster | | 55 | 🐰 Bunny |
| 6 | 🐥 Duckling | | 66 | 🦦 Otter |
| 10 | 🐢 Turtle | | 78 | 🦊 Fox cub |
| 15 | 🐸 Frog | | 91 | 🐨 Koala |
| 21 | 🐶 Puppy | | 105 | 🐼 Panda |
| 28 | 🦔 Hedgehog | | 120 | 🦄 Unicorn |
| 36 | 🐱 Kitten | | | |

**Dragons** are the big prize: one per times table, hatched from a 🥚 egg by
making all twelve facts in that table fluent (`7×1` through `7×12` gets you the
Dragon of the 7s). Twelve dragons, twenty-seven animals in all.

Animals are never taken away — if a fact goes stale later, you keep the animal
it earned. Only **Reset progress** clears them, and it says so before it does.

### Naming them

Click (or tap) any animal you have earned in the Menagerie to give it a name —
your hamster can be Nibbles, the Dragon of the 3s can be Sparky. **Enter** saves,
**Esc** cancels, and clearing the box puts the species name back. A renamed
animal shows what it started as in small print underneath, and the name follows
it everywhere: the sideline cheers, the welcome bubble, and the flying dragons.
Locked animals can't be named yet.

### They cheer you on

The animals you have earned line the sides of the drill (a single row above the
question on narrow screens) and bob quietly while you think. Every fluent answer
makes them hop, a snap-fast answer or a long streak sets off a bigger wave, and
they pipe up with a "Yay!" every third answer in a streak. A newly earned animal
hops in mid-session and the others welcome it.

They never react to a miss — the squad is encouragement, never a scold.

Hatched dragons fly across the top of the setup screen, and everything settles
into a static arrangement if your system asks for reduced motion.

## How the scheduling works

Each fact (`7 × 8` is tracked separately from `8 × 7`, because recall is
directional) carries an SM-2 style record: an ease factor, an interval, and a
due date.

- **New facts** are in a learning phase: you have to answer one **quickly**
  twice — with other questions in between — before it graduates to a real
  interval (1 day, or 2 if both answers were snap-fast). A slow correct answer
  repeats the step instead of advancing it.
- **Missing a fact** drops its ease, counts a lapse, and sends it straight
  back into learning. It reappears about three questions later in the same
  session.
- **Graduated facts** grow by `interval × ease` each time they're recalled
  quickly on or after their due date — roughly 1 → 3 → 8 → 20 days — with a
  small random fuzz so facts learned together don't clump forever. A slow
  answer cuts the interval back to 70% instead. Intervals cap at a year.
- **Practising early doesn't inflate the schedule.** Answering a fact that
  isn't due yet (extra practice, or free drill) leaves its interval alone —
  otherwise one long sitting would "master" the whole table. Getting it wrong
  early still counts as a lapse.

When nothing is due and there are no new facts left to introduce, the session
falls back to extra practice on whatever is closest to due, so a drill is
never empty.

## Progress

The grid shows every fact from 0×0 to 12×12, coloured by where it is in the
schedule:

| Colour | Meaning |
|---|---|
| Grey | Not tried yet |
| Red | Learning |
| Amber | Knows it, but not quick yet |
| Green | Fluent — three quick answers in a row |

**Needs work** lists the facts with the worst mix of errors, lapses, and slow
answers; **Drill my weakest 15 facts** runs a session over just those.
**Reset progress** erases the schedule and starts over.

## Notes

- Everything is stored under the `multiplication-fluency:v1` key in local
  storage. Clearing site data resets your schedule, and the schedule doesn't
  follow you between browsers or devices.
- The colour theme follows your system setting, with a manual toggle in the
  header.

## License

Apache-2.0 (see [LICENSE](LICENSE)).
