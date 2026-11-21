# Who Comes to Mind First? (jsPsych experiment)

Computational Cognition Laboratory, SIAS, Krea University
Supervisor: Rakesh Sengupta · Student: Namrita Thakur

This is the online experiment from Part 1 of the project plan (Section 3). It uses
**jsPsych 8.4.0**. jsPsych and all plugins are bundled in `lib/`, so the study runs
without loading anything from the internet. The only exception is saving to OSF.

The design is 2 (recency: low / high) × 2 (reminder: neutral / relational), between subjects.

| Group | Recency task | Reminder |
|------:|---|---|
| 1 | low (new places) | neutral (plan your week) |
| 2 | high (new people) | neutral |
| 3 | low | relational (close relationships) |
| 4 | high | relational |

## Put it on GitHub Pages

The live site saves each participant's data as one file in a **private** OSF folder, through DataPipe (pipe.jspsych.org).

**1. Set up DataPipe (once, about 10 minutes)**

1. On OSF, create a project, with a component called e.g. "data". Keep it **private**.
2. Create an OSF personal access token with the `osf.full_write` scope.
3. On https://pipe.jspsych.org, sign up, add the token, and create a new experiment linked to the "data" component.
4. In that experiment, turn on **data collection** and **condition assignment**, with **4 conditions**.
5. Copy the 12-character experiment ID into `DATAPIPE_EXPERIMENT_ID` in `config.js`.

**2. Publish (one command)**

```bash
sudo dnf install gh      # Fedora; once
gh auth login            # once
./deploy.sh              # creates github.com/<you>/who-comes-to-mind and turns on Pages
```

The site appears at `https://<you>.github.io/who-comes-to-mind/` after 1–2 minutes. To publish an edit (for example, new wording in `config.js`), run `./deploy.sh` again.

**Links**

| Link | What it does |
|---|---|
| `https://<you>.github.io/who-comes-to-mind/` | The real study, with balanced groups. Saves to OSF. |
| `…/?pid=P001` | The same, with your own participant ID |
| `…/?debug=1&group=4` | Pilot / test: short timings, a group badge, and the data file downloads to *your* computer (never to OSF) |

**Built-in safety checks**

- **Unconfigured link.** Until a DataPipe ID is set, the live link shows "This study is not open yet" instead of running a session that can't save.
- **Failed save.** If saving fails after three tries, the participant gets a download button and a code to email you.
- **No data in the repository.** `.gitignore` keeps any `data/` folder and `.csv` files out of the public repository.

**Things to know**

- **The repository is public.** Free GitHub Pages needs a public repository, so anyone can read the code, including the debrief and hypotheses. That is normal for pre-registered studies, but don't post the GitHub link where participants will see it. Share only the `github.io` link.
- **Saved files are named by participant ID.** They are `who-comes-to-mind_<pid>.json`. Give each person a unique `pid`, or leave it out and a random one is made, so two people's files never share a name.

## Try it locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/?debug=1&group=4`.

**URL options:** `pid=`, `group=1..4`, `debug=1`, and `save=local|datapipe|jatos`.

## Session flow (matches Section 3.3 of the plan)

1. **Device check.** Laptop or desktop only, window at least 800 × 500.
2. **Consent.** Two questions: 18 or over, and agree to take part. Either "no" ends the study and nothing is saved.
3. **Practice** ("Name three fruits"). Untimed, and it can be repeated.
4. **Recency task** (Task 1). A list of new people (as codes) or new places. Continue turns on after `RECENCY_MIN_S`.
5. **Reminder** (Task 2). Free writing. Continue turns on after `REMINDER_MIN_S`. Below 150 characters, the participant gets one gentle nudge and can then skip.
6. **Timed name generator** (Task 3). "Who are the people closest to you?" The participant presses SPACE, types a code and presses ENTER, up to 5 times.
7. **Control** (Task 4). "Name five places you go to regularly", with the same procedure.
8. **Who else came to mind?** Codes for people who came to mind but were not listed, each with "Did you deliberately set them aside?" (Yes / No / Not sure).
9. **About each person.** One page per person, covering both listed and not-listed people, with the five questions from Section 3.4.
10. **Checks.** These cover how much Task 2 made them think about relationships, the calm–tense rating and the strategy question. They also ask whether they pictured a specific person in Task 2, used their phone, or were interrupted.
11. **Debrief.** Explains the study, then offers "Save my responses" or "Do not save".
12. **Save.** Tries three times. If saving fails, a download button appears so nothing is lost.

A **Stop the study** button stays at the top right from consent until the debrief. Stopping saves nothing.

## What is measured in the timed name generator

Time zero is the first screen frame on which the question appears (after a 1 s "+").

For each person (`items` in the data):

| Field | Meaning | Used for |
|---|---|---|
| `rt_from_onset` | question onset → SPACE | first-retrieval time (H1, H2); retrieval time per person (H3) |
| `latency_from_ready` | previous ENTER (or onset) → SPACE. Excludes typing time. | H3, as a cleaner alternative |
| `typing_ms`, `first_key_ms` | SPACE → ENTER, and SPACE → first keystroke | data cleaning |
| `position` | order in the list | H3 |

The trial also records:

- `false_starts`: SPACE presses cancelled with ESC.
- `n_keys_before_space`: typing without pressing SPACE first.
- `ended_by`: `max_items`, `done_button` or `timeout`. The trial times out after `NG_TIMEOUT_S` with no SPACE press.

## Settings and wording

Everything you are likely to change after the Week 3 pilot is in **`config.js`**. This covers the save mode, timings, maximum items, groups and contacts, plus every piece of text participants read. Placeholders in `[SQUARE BRACKETS]` must be filled before going live:

- Krea IRB approval number
- Namrita's email
- the Krea counselling / wellness contact
- the DataPipe ID (if using DataPipe)

## Other ways to save

Set `SAVE_MODE` in `config.js` to one of these:

- `datapipe` (default): saves to OSF, as described above.
- `jatos`: also uncomment `<script src="jatos.js">` in `index.html`. *Not tested here.*
- `local`: downloads a file at the end. Use this only for piloting.

## Turning data files into tables (Week 6)

```bash
python3 tools/extract_tables.py path/to/folder_with_json_files
```

This writes three tables:

- `participants.csv`: one row per person who took part (first-retrieval times, control time, counts, checks).
- `persons.csv`: one row per person named or reported (position, times, set aside, closeness, first met, see / think frequency, significant event). Use this for H3 and the mixed-effects model.
- `items_close.csv`: every SPACE press in the close-people question.

Within each response file, the row with `trial_role == "summary"` already holds both the participant summary and the person table.

## Test

`tests/walkthrough.py` drives the whole study in headless Chrome. It runs all four groups, a "no consent" run and a "Stop the study" run, and checks the saved data. It needs Playwright (`pip install playwright`, then `playwright install chromium`, then change `CHROME` in the script).

```bash
python3 -m http.server 8000 &
python3 tests/walkthrough.py http://localhost:8000/index.html          # ~1 min
python3 tests/walkthrough.py http://localhost:8000/index.html --live   # + full-length DataPipe run (mocked), ~5 min
```

## Choices made here that go beyond the plan (to confirm together)

- **Minimum times:** 120 s for Task 1 and 180 s for Task 2. There is no hard maximum, and time on task is recorded.
- **Privacy check on codes:** codes need at least 3 characters, and anything that looks like initials ("RS", "R.K.") is rejected with a message. Full names cannot be blocked automatically.
- **Per-person questions come in random order**, so list position cannot shape the ratings.
- **Two retrieval-time measures** are recorded (see above). The pre-registration should name which one is primary for H3.
- **Extra checks:** phone use and interruptions. These are possible exclusion rules for the pre-registration.
- **No demographics** are collected beyond the 18+ question. Add them in `config.js` / `experiment.js` if the IRB application needs them.

## Data protection reminder

The free-text answers (Task 2 writing, strategy) can contain names despite the instructions. Screen them before sharing any data publicly. Keep the OSF data component private.
