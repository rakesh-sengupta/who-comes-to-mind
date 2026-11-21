# Who Comes to Mind First? (jsPsych experiment)

Computational Cognition Laboratory, SIAS, Krea University
Supervisor: Rakesh Sengupta · Student: Namrita Thakur

This is the online experiment from Part 1 of the project plan (Section 3). It uses
**jsPsych 8.4.0**. jsPsych and all plugins are bundled in `lib/`, so the study runs
without loading anything from the internet. The only exception is saving to your Google Sheet.

The design is 2 (recency: low / high) × 2 (reminder: neutral / relational), between subjects.

| Group | Recency task | Reminder |
|------:|---|---|
| 1 | low (new places) | neutral (plan your week) |
| 2 | high (new people) | neutral |
| 3 | low | relational (close relationships) |
| 4 | high | relational |

## Put it on GitHub Pages, saving to Google Drive

The study runs on GitHub Pages. Each finished session is sent to a small Google Apps Script inside **your own Google Sheet** (`google-apps-script/Code.gs`). The script does three things:

- adds rows to the Sheet's tabs: `participants`, `persons` and `items_close`
- saves the full raw data file in a Drive folder called **who-comes-to-mind raw data**, next to the Sheet
- hands out the four groups so they stay balanced among people who finish (logged in the `assignments` tab)

### 1. Make the Google Sheet receiver (once, about 10 minutes)

1. **Create the Sheet.** In Google Drive, make a new Google Sheet, e.g. "Who comes to mind — data". Leave it private.
2. **Paste the script.** Open **Extensions → Apps Script**, delete the sample code, paste in all of `google-apps-script/Code.gs`, and click **Save**.
3. **Grant permissions.** Pick the function **`setup`** in the toolbar and click **Run**. Google asks for permission. Choose your account, then **Advanced → Go to … (unsafe) → Allow**. The "unsafe" warning appears for any script you write yourself. `setup` creates the tabs and the Drive folder.
4. **Deploy.** Click **Deploy → New deployment**, click the gear icon, and choose **Web app**. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone

   Then click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
5. **Connect the study.** Paste that URL into `GSHEET_URL` in `config.js`.
6. **Check it works.** Open the URL in a browser. It should say *"Receiver for who-comes-to-mind is running."*

> **If "Anyone" is not offered in step 4,** Krea's Google Workspace probably limits scripts to Krea accounts. Participants' browsers would then be refused. Do steps 1–5 from a personal Gmail account instead.

**When you edit `Code.gs` later:** go to **Deploy → Manage deployments → ✎ Edit → Version: New version → Deploy**. This keeps the same URL. A *New deployment* would give you a new URL.

### 2. Publish the study (one command)

```bash
sudo dnf install gh      # Fedora; once
gh auth login            # once
./deploy.sh              # creates github.com/<you>/who-comes-to-mind and turns on Pages
```

The site appears at `https://<you>.github.io/who-comes-to-mind/` after 1–2 minutes. To publish an edit, run `./deploy.sh` again.

### 3. Do one real test before recruiting

Open `https://<you>.github.io/who-comes-to-mind/?debug=1&save=gsheet` and go through to the end. Check that rows appear in the Sheet and that a file appears in the Drive folder. The test rows are marked `debug = TRUE`. They are left out of group balancing; delete them before analysis.

### Links

| Link | What it does |
|---|---|
| `https://<you>.github.io/who-comes-to-mind/` | The real study, with balanced groups. Saves to the Sheet. |
| `…/?pid=P001` | The same, with your own participant ID |
| `…/?debug=1&group=4` | Pilot: short timings and a group badge. The file downloads to *your* computer and never reaches the Sheet. |
| `…/?debug=1&save=gsheet` | Pilot that *does* save to the Sheet (rows marked `debug`) |

### Built-in safety checks

- **Unconfigured link.** Until `GSHEET_URL` is set, the live link shows "This study is not open yet" instead of running a session that can't save.
- **Saving retries.** The browser tries to save three times. If a reply gets lost, it asks the Sheet whether the data already arrived. Each session has its own `submission_id`, so retries never create duplicate rows.
- **Download fallback.** If saving still fails, the participant gets a download button and a code to email you.
- **Typed text stays text.** Codes typed by participants are stored as plain text, never run as spreadsheet formulas.

### Things to know

- **The repository is public.** Free GitHub Pages needs a public repository. Anyone can read the code, including the debrief and the script URL. Share only the `github.io` link with participants.
- **The script can only add data.** It runs as you, but browsers can only *add* rows; nobody can read the Sheet through it. Someone who dug the URL out of the code could add junk rows, but they would have to imitate the study's data format. Check odd `pid`s and times before analysis.

## Try it locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/?debug=1&group=4`.

**URL options:** `pid=`, `group=1..4`, `debug=1`, and `save=gsheet|local`.

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

Everything you are likely to change after the Week 3 pilot is in **`config.js`**. This covers the save mode and Sheet URL, timings, maximum items, groups and contacts, plus every piece of text participants read. Placeholders in `[SQUARE BRACKETS]` must be filled before going live:

- Krea IRB approval number
- Namrita's email
- the Krea counselling / wellness contact
- `GSHEET_URL` (from step 1 above)

## Other save mode

`SAVE_MODE: "local"` in `config.js` (or `?save=local` in the URL) downloads a file at the end instead of saving to the Sheet. Use it for piloting on your own machine.

## Getting the data (Week 6)

The Sheet already holds the analysis tables, one tab each. Use **File → Download → CSV** on each tab, or read the Sheet directly into R or Python.

- `participants`: one row per person who took part (first-retrieval times, control time, counts, checks)
- `persons`: one row per person named or reported (position, times, set aside, closeness, first met, see / think frequency, significant event). Use this for H3 and the mixed-effects model.
- `items_close`: every SPACE press in the close-people question
- `assignments`: who was given which group, and when. People who started but did not finish show up here only.

Drop rows with `debug = TRUE` first.

The raw files in the Drive folder hold everything, including the writing-task text and every timing. If you ever need to rebuild the tables from them, download the folder and run:

```bash
python3 tools/extract_tables.py path/to/folder_with_json_files
```

## Test

`tests/walkthrough.py` drives the whole study in headless Chrome. It runs all four groups and a "no consent" run. It also runs a "Stop the study" run and four sessions saved through the mock Sheet, one with a lost reply. It checks the saved data each time. It needs Playwright (`pip install playwright`, then `playwright install chromium`, then change `CHROME` in the script).

```bash
python3 -m http.server 8000 &
node tests/apps_script_mock.js 8790 &         # runs the real Code.gs against a fake Sheet + Drive
python3 tests/walkthrough.py http://localhost:8000/index.html
node tests/test_apps_script.js                 # unit tests for Code.gs alone
```

## Choices made here that go beyond the plan (to confirm together)

- **Minimum times:** 120 s for Task 1 and 180 s for Task 2. There is no hard maximum, and time on task is recorded.
- **Privacy check on codes:** codes need at least 3 characters, and anything that looks like initials ("RS", "R.K.") is rejected with a message. Full names cannot be blocked automatically.
- **Per-person questions come in random order**, so list position cannot shape the ratings.
- **Two retrieval-time measures** are recorded (see above). The pre-registration should name which one is primary for H3.
- **Extra checks:** phone use and interruptions. These are possible exclusion rules for the pre-registration.
- **No demographics** are collected beyond the 18+ question. Add them in `config.js` / `experiment.js` if the IRB application needs them.

## Data protection reminder

The free-text answers (Task 2 writing, strategy) can contain names despite the instructions. Screen them before sharing any data publicly. Keep the Sheet and the raw-data folder private (don't share them with "anyone with the link").
