# Multiplication Fluency

A spaced-repetition drill for the times tables. Every fact you answer gets its
own review schedule: miss one and it comes back a few questions later, nail it
and it moves out to days, then weeks. No server, no build step, no accounts —
your schedule lives in the browser's local storage.

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
5. The summary shows accuracy, median answer time, what you missed, and what
   the scheduler did with those facts.

## How the scheduling works

Each fact (`7 × 8` is tracked separately from `8 × 7`, because recall is
directional) carries an SM-2 style record: an ease factor, an interval, and a
due date.

Your answer is graded automatically from whether it was right and how long it
took:

| Answer | Grade |
|---|---|
| Wrong | *again* |
| Correct, under 2.5s | *easy* |
| Correct, under 6s | *good* |
| Correct, slower | *hard* |

- **New facts** are in a learning phase: you have to answer one correctly
  **twice** — with other questions in between — before it graduates to a
  real interval (1 day, or 2 if both answers were quick).
- **Missing a fact** drops its ease, counts a lapse, and sends it straight
  back into learning. It reappears about three questions later in the same
  session.
- **Graduated facts** grow by `interval × ease` each time they're reviewed on
  or after their due date — roughly 1 → 3 → 8 → 20 days — with a small random
  fuzz so facts learned together don't clump forever. A *hard* answer shrinks
  the step, an *easy* one stretches it. Intervals cap at a year.
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
| Red | Learning — due within a day |
| Amber | In review — days out |
| Green | Fluent — two weeks or more between reviews |

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
