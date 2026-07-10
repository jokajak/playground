# WCA Scorecard Generator

Prints official-style WCA competition scorecards so you can run a fake
competition for fake people at home. Competition name, event, round, group,
competitor name, registrant ID, WCA ID, time limit, and cutoff are editable
right on each card — type them in, or leave any of them blank to fill in by
hand. Results and the per-attempt scrambler/judge/competitor signatures are
always blank for hand-writing.

Modeled on the scorecards produced by
[Goosly/wca-scorecards](https://github.com/Goosly/wca-scorecards), but with no
WCA data, no accounts, and no scrambles (real competitions keep scrambles on
separate scramble sheets).

## Use it

**https://jokajak.github.io/playground/cubing/wca-scorecard-generator/**

Open `index.html` directly in your browser, or serve it like the other
utilities:

```sh
cd cubing/wca-scorecard-generator
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## How to use

1. Pick a **Format** — **Best of 1/2/3** and **Mean of 3** give 1, 2, 3, and 3
   attempt rows respectively; **Average of 5** gives 5. **Average of 5 (cutoff
   after 2)** also gives 5 rows but adds a marked line after attempt 2, since a
   WCA cutoff round still runs to 5 attempts but only continues past attempt 2
   if the competitor beats the cutoff there.
2. Set how many **Extra rows** (blank spares for replacement attempts) each card
   should have, and how many **Scorecards** to print.
3. Type the competition, event, round, group, name, ID, WCA ID, time limit
   and cutoff directly into each card — every card is independent, so
   different cards can have different names or even different competitions.
   Leave any field blank to fill it in by hand later.
4. Hit **Print**. The controls disappear and the cards print four to a Letter
   page.
5. Fill in results and signatures by hand.
