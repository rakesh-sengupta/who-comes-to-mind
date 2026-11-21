/*
 * Who Comes to Mind First? — experiment timeline (jsPsych 8)
 * 2 (recency: low / high) x 2 (reminder: neutral / relational), between subjects.
 *
 * URL parameters:
 *   ?pid=ABC123   participant ID (otherwise a random one is made)
 *   ?group=1..4   force a group (piloting); see CONFIG.GROUPS
 *   ?debug=1      short timings and a visible group badge
 *   ?save=local   override CONFIG.SAVE_MODE (gsheet | local)
 */

/* ---------------- Setup ---------------- */
const URLP = new URLSearchParams(window.location.search);
const DEBUG = URLP.get("debug") === "1";
const TIMING = DEBUG ? CONFIG.DEBUG_TIMING : CONFIG.TIMING;
const SAVE_MODE = URLP.get("save") || (DEBUG ? "local" : CONFIG.SAVE_MODE);
const GSHEET_READY = /^https:\/\/script\.google\.com\/.+\/exec$/.test(CONFIG.GSHEET_URL);

/** fetch with a time limit */
async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const S = {
  // session state
  group: null,
  recency: null,
  reminder: null,
  assignment_method: null,
  persons: [],
  personIdx: 0,
  saveChoice: null,
  saveOK: null,
};

const jsPsych = initJsPsych({
  show_progress_bar: false,
  on_finish: () => {
    hideStopButton();
  },
});

const PID = (URLP.get("pid") || jsPsych.randomization.randomID(10)).replace(/[^A-Za-z0-9_-]/g, "");

jsPsych.data.addProperties({
  pid: PID,
  study_id: CONFIG.STUDY_ID,
  study_version: CONFIG.STUDY_VERSION,
  save_mode: SAVE_MODE,
  debug: DEBUG,
  session_start: new Date().toISOString(),
});

const fmtDuration = (s) => (s >= 60 ? `${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? "" : "s"}` : `${s} seconds`);
const esc = EgoRecallUtils.escapeHtml;
/* call-function trials store their return under "value": lift it to top-level columns */
const flattenValue = (d) => {
  if (d.value && typeof d.value === "object") Object.assign(d, d.value);
  delete d.value;
};

/* ---------------- "Stop the study" button (ethics: stop at any time) ---------------- */
function buildStopButton() {
  const btn = document.createElement("button");
  btn.id = "stop-study";
  btn.type = "button";
  btn.textContent = "Stop the study";
  btn.hidden = true;
  document.body.appendChild(btn);

  const overlay = document.createElement("div");
  overlay.id = "stop-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="stop-dialog" role="dialog" aria-modal="true">
      <p><b>Do you want to stop the study?</b></p>
      <p>If you stop, nothing you have typed will be saved.</p>
      <div class="stop-buttons">
        <button type="button" class="jspsych-btn" id="stop-cancel">Keep going</button>
        <button type="button" class="jspsych-btn" id="stop-confirm">Stop and leave</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  // keep keypresses on the dialog from reaching the task underneath
  overlay.addEventListener("keydown", (e) => e.stopPropagation());

  btn.addEventListener("click", () => {
    overlay.hidden = false;
    overlay.querySelector("#stop-cancel").focus();
  });
  overlay.querySelector("#stop-cancel").addEventListener("click", () => {
    overlay.hidden = true;
    overlay.querySelector("#stop-cancel").blur();
  });
  overlay.querySelector("#stop-confirm").addEventListener("click", () => {
    overlay.hidden = true;
    hideStopButton();
    jsPsych.abortExperiment(TEXT.withdrawn, { trial_role: "withdrawn" });
  });
}
const showStopButton = () => {
  const b = document.getElementById("stop-study");
  if (b) b.hidden = false;
};
const hideStopButton = () => {
  const b = document.getElementById("stop-study");
  if (b) b.hidden = true;
};
buildStopButton();

/* ---------------- Reusable bits ---------------- */
const fixation = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: '<div class="fixation">+</div>',
  choices: "NO_KEYS",
  trial_duration: () => TIMING.FIXATION_MS,
  data: { trial_role: "fixation" },
};

const screen = (html, label = "Continue", role = "instructions") => ({
  type: jsPsychHtmlButtonResponse,
  stimulus: `<div class="page">${html}</div>`,
  choices: [label],
  data: { trial_role: role },
});

const likert = (name, question, left, right, n = 7) => {
  let cells = "";
  for (let i = 1; i <= n; i++) {
    cells += `<label class="lk-cell"><input type="radio" name="${name}" value="${i}"><span>${i}</span></label>`;
  }
  return `<fieldset class="q"><legend>${question}</legend>
    <div class="lk"><span class="lk-end">${left}</span>${cells}<span class="lk-end">${right}</span></div></fieldset>`;
};

const choice = (name, question, options) => {
  const opts = options
    .map(([v, l]) => `<label class="ch"><input type="radio" name="${name}" value="${v}"> ${l}</label>`)
    .join("");
  return `<fieldset class="q"><legend>${question}</legend><div class="ch-group">${opts}</div></fieldset>`;
};

/* ====================================================================
 * 0. Device check and group assignment
 * ==================================================================== */
const browserCheck = {
  type: jsPsychBrowserCheck,
  minimum_width: 800,
  minimum_height: 500,
  inclusion_function: (d) => d.mobile === false,
  exclusion_message: () => `<div class="page">${TEXT.device_exclusion}</div>`,
  data: { trial_role: "browser_check" },
};

const assignGroup = {
  type: jsPsychCallFunction,
  on_finish: flattenValue,
  async: true,
  func: async (done) => {
    let g = parseInt(URLP.get("group"), 10);
    let method = "url";
    if (!(g >= 1 && g <= 4)) {
      g = null;
      if (SAVE_MODE === "gsheet" && CONFIG.BALANCED_ASSIGNMENT && GSHEET_READY) {
        try {
          const res = await fetchWithTimeout(
            `${CONFIG.GSHEET_URL}?action=condition&pid=${encodeURIComponent(PID)}`, {}, 10000);
          const j = await res.json();
          if (j.ok && Number.isInteger(j.group) && j.group >= 1 && j.group <= 4) {
            g = j.group;
            method = "sheet_balanced";
          }
        } catch (err) {
          /* fall back to random */
        }
      }
      if (g === null) {
        g = jsPsych.randomization.sampleWithoutReplacement([1, 2, 3, 4], 1)[0];
        method = "random";
      }
    }
    S.group = g;
    S.recency = CONFIG.GROUPS[g].recency;
    S.reminder = CONFIG.GROUPS[g].reminder;
    S.assignment_method = method;
    jsPsych.data.addProperties({ group: g, recency: S.recency, reminder: S.reminder, assignment_method: method });
    if (DEBUG) {
      const badge = document.createElement("div");
      badge.id = "debug-badge";
      badge.textContent = `DEBUG · group ${g} · ${S.recency} recency · ${S.reminder} reminder · ${SAVE_MODE}`;
      document.body.appendChild(badge);
    }
    done({ trial_role: "assignment" });
  },
};

/* ====================================================================
 * 1. Consent (18 or over)
 * ==================================================================== */
const consent = {
  type: jsPsychSurveyHtmlForm,
  preamble: `<div class="page">${TEXT.consent}</div>`,
  html: `<div class="page">
      ${choice("age18", "Are you 18 years old or over?", [["yes", "Yes"], ["no", "No"]])}
      ${choice("agree", "Do you agree to take part?", [["yes", "Yes, I agree"], ["no", "No, I do not want to take part"]])}
    </div>`,
  button_label: "Continue",
  data: { trial_role: "consent" },
  on_load: () => {
    document.querySelectorAll('input[name="age18"], input[name="agree"]').forEach((el) => (el.required = true));
  },
  on_finish: (d) => {
    const ok = d.response.age18 === "yes" && d.response.agree === "yes";
    d.consented = ok;
    if (!ok) jsPsych.abortExperiment(`<div class="page">${TEXT.not_consented}</div>`, { trial_role: "no_consent" });
    else showStopButton();
  },
};

/* ====================================================================
 * 2. Practice (untimed): three fruits; can repeat
 * ==================================================================== */
const practiceLoop = {
  timeline: [
    fixation,
    {
      type: jsPsychTimedNameGenerator,
      question_id: "practice_fruits",
      prompt: TEXT.practice_prompt,
      max_items: CONFIG.PRACTICE_ITEMS,
      code_mode: false,
      item_word: "fruit",
      first_waiting_message: "Press <b>SPACE</b> the moment a fruit comes to mind.",
      waiting_message: "Press <b>SPACE</b> the moment the next fruit comes to mind.",
      input_label: "Type the fruit, then press <b>ENTER</b>.",
      done_label: "I can't think of more",
      data: { trial_role: "ng_practice" },
    },
    {
      type: jsPsychHtmlButtonResponse,
      stimulus: `<div class="page">${TEXT.practice_after}</div>`,
      choices: ["Practise again", "I'm ready to go on"],
      data: { trial_role: "practice_check" },
    },
  ],
  loop_function: (data) => data.values().slice(-1)[0].response === 0,
};

/* ====================================================================
 * 3. Recency task (high: new people / low: new places)
 * ==================================================================== */
const recencyTask = {
  type: jsPsychListEntry,
  task_id: () => (S.recency === "high" ? "recency_people" : "recency_places"),
  preamble: () => `<div class="page">${S.recency === "high" ? TEXT.recency_high : TEXT.recency_low}</div>`,
  entry_label: () => (S.recency === "high" ? "Code for a new person" : "New place"),
  placeholder: () => (S.recency === "high" ? "a code, not a name" : "a place"),
  code_mode: () => S.recency === "high",
  min_code_length: CONFIG.MIN_CODE_LENGTH,
  n_rows_start: 5,
  max_rows: 20,
  min_time_ms: () => TIMING.RECENCY_MIN_S * 1000,
  min_time_message: () => TEXT.recency_min_message.replace("{MIN}", fmtDuration(TIMING.RECENCY_MIN_S)),
  empty_nudge: () =>
    S.recency === "high"
      ? "You have not listed anyone. Try thinking through your days one at a time. If no one comes to mind, click Continue again."
      : "You have not listed any places. Try thinking through your days one at a time. If none come to mind, click Continue again.",
  data: { trial_role: "recency_task" },
};

/* ====================================================================
 * 4. Reminder (relational / neutral writing)
 * ==================================================================== */
const reminderTask = {
  type: jsPsychTimedWriting,
  task_id: () => (S.reminder === "relational" ? "reminder_relational" : "reminder_neutral"),
  preamble: () => `<div class="page">${S.reminder === "relational" ? TEXT.reminder_relational : TEXT.reminder_neutral}</div>`,
  rows: 10,
  min_time_ms: () => TIMING.REMINDER_MIN_S * 1000,
  min_time_message: () => TEXT.reminder_min_message.replace("{MIN}", fmtDuration(TIMING.REMINDER_MIN_S)),
  nudge_chars: CONFIG.WRITING_NUDGE_CHARS,
  data: { trial_role: "reminder_task" },
};

/* ====================================================================
 * 5. Timed name generator: closest people
 * ==================================================================== */
const nameGenerator = {
  timeline: [
    screen(TEXT.ng_intro, "Start", "ng_intro"),
    fixation,
    {
      type: jsPsychTimedNameGenerator,
      question_id: "close_people",
      prompt: TEXT.ng_prompt,
      max_items: CONFIG.MAX_PEOPLE,
      code_mode: true,
      min_code_length: CONFIG.MIN_CODE_LENGTH,
      item_word: "person",
      first_waiting_message: "Press <b>SPACE</b> the moment the first person comes to mind.",
      waiting_message: "Press <b>SPACE</b> the moment the next person comes to mind.",
      input_label: "Type a <b>code</b> for this person (not their name or initials), then press <b>ENTER</b>.",
      done_label: "No one else comes to mind",
      timeout_ms: () => TIMING.NG_TIMEOUT_S * 1000,
      data: { trial_role: "ng_main" },
    },
  ],
};

/* ====================================================================
 * 6. Control: places, same procedure
 * ==================================================================== */
const controlGenerator = {
  timeline: [
    screen(TEXT.control_intro, "Start", "control_intro"),
    fixation,
    {
      type: jsPsychTimedNameGenerator,
      question_id: "places_control",
      prompt: TEXT.control_prompt,
      max_items: CONFIG.MAX_PLACES,
      code_mode: false,
      item_word: "place",
      first_waiting_message: "Press <b>SPACE</b> the moment the first place comes to mind.",
      waiting_message: "Press <b>SPACE</b> the moment the next place comes to mind.",
      input_label: "Type the place, then press <b>ENTER</b>.",
      done_label: "No more places come to mind",
      timeout_ms: () => TIMING.NG_TIMEOUT_S * 1000,
      data: { trial_role: "ng_control" },
    },
  ],
};

/* ====================================================================
 * 7. Who else came to mind?
 * ==================================================================== */
const mainCodes = () => {
  const t = jsPsych.data.get().filter({ trial_role: "ng_main" }).values()[0];
  return t ? t.items.map((x) => x.code) : [];
};

const whoElse = {
  type: jsPsychListEntry,
  task_id: "who_else",
  preamble: () => {
    const listed = mainCodes();
    const shown = listed.length
      ? `<p class="muted">You listed: ${listed.map((c) => `<span class="eg">${esc(c)}</span>`).join(" ")}</p>`
      : "";
    return `<div class="page">${TEXT.who_else}${shown}</div>`;
  },
  entry_label: "Code for a person who came to mind",
  placeholder: "a code, not a name",
  code_mode: true,
  min_code_length: CONFIG.MIN_CODE_LENGTH,
  n_rows_start: 3,
  max_rows: 10,
  row_question: {
    name: "set_aside",
    label: "Did you deliberately set them aside?",
    options: ["Yes", "No", "Not sure"],
  },
  forbidden: () => mainCodes(),
  forbidden_message: "You already listed this code. Use this page only for people you did not list.",
  none_label: "No one else came to mind",
  empty_nudge: "If no one else came to mind, please tick the box at the top. Or click Continue again to move on.",
  data: { trial_role: "who_else" },
};

/* ====================================================================
 * 8. Questions about each person (one page per person, random order)
 * ==================================================================== */
const buildPersons = {
  type: jsPsychCallFunction,
  on_finish: flattenValue,
  func: () => {
    const main = jsPsych.data.get().filter({ trial_role: "ng_main" }).values()[0];
    const other = jsPsych.data.get().filter({ trial_role: "who_else" }).values()[0];
    const persons = [];
    (main ? main.items : []).forEach((it) =>
      persons.push({
        code: it.code,
        source: "listed",
        list_position: it.position,
        rt_from_onset: it.rt_from_onset,
        latency_from_ready: it.latency_from_ready,
        set_aside: null,
      })
    );
    (other ? other.entries : []).forEach((e) =>
      persons.push({
        code: e.text,
        source: "came_to_mind_not_listed",
        list_position: null,
        rt_from_onset: null,
        latency_from_ready: null,
        set_aside: e.set_aside,
      })
    );
    S.persons = jsPsych.randomization.shuffle(persons);
    S.personIdx = 0;
    return { trial_role: "person_list", n_persons: persons.length, rating_order: S.persons.map((p) => p.code) };
  },
};

const personPage = {
  type: jsPsychSurveyHtmlForm,
  preamble: () => {
    const p = S.persons[S.personIdx];
    const note = p.source === "listed" ? "" : '<p class="muted">(came to mind, but you did not list them)</p>';
    return `<div class="page pp-head">
        <p class="muted">Person ${S.personIdx + 1} of ${S.persons.length}</p>
        <p class="pp-code">${esc(p.code)}</p>${note}</div>`;
  },
  html: () => `<div class="page">
      ${likert("closeness", "How close are you to this person?", "1 = not at all", "7 = extremely")}
      ${choice("first_met", "When did you first meet?", [
        ["last_2_weeks", "In the last two weeks"],
        ["last_year", "In the last year"],
        ["longer_ago", "Longer ago"],
      ])}
      ${choice("see_freq", "How often do you see or talk with them?", [
        ["1", "Less than monthly"],
        ["2", "Monthly"],
        ["3", "Weekly"],
        ["4", "Several times a week"],
        ["5", "Daily"],
      ])}
      ${choice("think_freq", "How often do they come to mind when they are not around?", [
        ["1", "Almost never"],
        ["2", "Sometimes"],
        ["3", "Often"],
        ["4", "Several times a day"],
      ])}
      ${choice("sig_event", "Did they help you through a significant event, such as a crisis or a big new start?", [
        ["yes", "Yes"],
        ["no", "No"],
      ])}
    </div>`,
  button_label: "Next",
  data: { trial_role: "person_rating" },
  on_finish: (d) => {
    const p = S.persons[S.personIdx];
    Object.assign(d, {
      person_code: p.code,
      person_source: p.source,
      list_position: p.list_position,
      rating_order: S.personIdx + 1,
    });
    S.personIdx += 1;
  },
};

const personBlock = {
  timeline: [
    screen(TEXT.person_intro, "Start", "person_intro"),
    { timeline: [personPage], loop_function: () => S.personIdx < S.persons.length },
  ],
  conditional_function: () => S.persons.length > 0,
};

/* ====================================================================
 * 9. Checks
 * ==================================================================== */
const checks = {
  type: jsPsychSurveyHtmlForm,
  preamble: `<div class="page">${TEXT.checks_preamble}</div>`,
  html: `<div class="page">
      ${likert("writing_relationships", "How much did the second writing task (Task 2) make you think about your relationships?", "1 = not at all", "7 = very much")}
      ${choice("writing_specific_person", "During Task 2, did you write about or picture a specific person?", [
        ["yes", "Yes"],
        ["no", "No"],
        ["not_sure", "Not sure"],
      ])}
      ${likert("calm_tense", "How calm or tense do you feel right now?", "1 = very calm", "7 = very tense")}
      <fieldset class="q"><legend>How did you think of names in Task 3? (For example: went through family first,
        pictured places, scrolled through my phone in my head.)</legend>
        <textarea name="strategy" rows="3"></textarea></fieldset>
      ${choice("used_phone", "Did you look at your phone, contacts or social media to help you think of people?", [
        ["no", "No"],
        ["yes", "Yes"],
      ])}
      ${choice("interrupted", "Were you interrupted or distracted during Tasks 3 or 4?", [
        ["no", "No"],
        ["yes", "Yes"],
      ])}
    </div>`,
  button_label: "Continue",
  data: { trial_role: "checks" },
};

/* ====================================================================
 * 10. Debrief, with a last chance not to save
 * ==================================================================== */
const debrief = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `<div class="page">${TEXT.debrief}</div>`,
  choices: ["Save my responses", "Do not save my responses"],
  data: { trial_role: "debrief" },
  on_start: () => hideStopButton(),
  on_finish: (d) => {
    S.saveChoice = d.response === 0;
    d.save_choice = S.saveChoice;
  },
};

/* ====================================================================
 * 11. Summary rows (one participant row + one row per person)
 * ==================================================================== */
const summarise = {
  type: jsPsychCallFunction,
  on_finish: flattenValue,
  func: () => {
    const get = (role) => jsPsych.data.get().filter({ trial_role: role }).values();
    const main = get("ng_main")[0] || {};
    const ctrl = get("ng_control")[0] || {};
    const rec = get("recency_task")[0] || {};
    const rem = get("reminder_task")[0] || {};
    const other = get("who_else")[0] || {};
    const chk = (get("checks")[0] || {}).response || {};
    const ratings = get("person_rating");

    const ratingFor = (code, source) => ratings.find((r) => r.person_code === code && r.person_source === source);
    const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

    const persons = S.persons.map((p) => {
      const r = (ratingFor(p.code, p.source) || {}).response || {};
      return {
        pid: PID,
        group: S.group,
        recency: S.recency,
        reminder: S.reminder,
        code: p.code,
        source: p.source,
        list_position: p.list_position,
        rt_from_onset: p.rt_from_onset,
        latency_from_ready: p.latency_from_ready,
        set_aside: p.set_aside,
        closeness: num(r.closeness),
        first_met: r.first_met || null,
        see_freq: num(r.see_freq),
        think_freq: num(r.think_freq),
        sig_event: r.sig_event || null,
      };
    });

    const summary = {
      pid: PID,
      group: S.group,
      recency: S.recency,
      reminder: S.reminder,
      assignment_method: S.assignment_method,
      first_rt_close: main.first_rt ?? null,
      n_close: main.n_items ?? null,
      close_ended_by: main.ended_by ?? null,
      n_false_starts_close: main.n_false_starts ?? null,
      first_rt_places: ctrl.first_rt ?? null,
      n_places: ctrl.n_items ?? null,
      n_recency_entries: rec.n_entries ?? null,
      recency_time_s: rec.time_on_task ? Math.round(rec.time_on_task / 1000) : null,
      reminder_chars: rem.n_chars ?? null,
      reminder_words: rem.n_words ?? null,
      reminder_time_s: rem.time_on_task ? Math.round(rem.time_on_task / 1000) : null,
      reminder_pastes: rem.n_pastes ?? null,
      n_not_listed: other.n_entries ?? 0,
      n_set_aside_yes: (other.entries || []).filter((e) => e.set_aside === "Yes").length,
      n_listed_met_last_2_weeks: persons.filter((p) => p.source === "listed" && p.first_met === "last_2_weeks").length,
      n_not_listed_met_last_2_weeks: persons.filter((p) => p.source !== "listed" && p.first_met === "last_2_weeks").length,
      writing_relationships: num(chk.writing_relationships),
      writing_specific_person: chk.writing_specific_person || null,
      calm_tense: num(chk.calm_tense),
      used_phone: chk.used_phone || null,
      interrupted: chk.interrupted || null,
      session_minutes: Math.round(jsPsych.getTotalTime() / 600) / 100,
    };
    return { trial_role: "summary", summary: summary, persons: persons };
  },
};

/* ====================================================================
 * 12. Save (with retries and a download fallback)
 * ==================================================================== */
// One ID per session, so a retried save is never stored twice
const SUBMISSION_ID = `${PID}_${Date.now()}`;
jsPsych.data.addProperties({ submission_id: SUBMISSION_ID });

async function saveOnce(dataString, filename) {
  if (SAVE_MODE === "gsheet") {
    const payload = JSON.stringify({
      study_id: CONFIG.STUDY_ID,
      submission_id: SUBMISSION_ID,
      pid: PID,
      filename: filename,
      data: dataString,
    });
    try {
      // sent as text/plain so the browser does not need a CORS preflight
      const res = await fetchWithTimeout(CONFIG.GSHEET_URL, { method: "POST", body: payload }, 30000);
      const j = await res.json();
      if (j.ok) return true;
      throw new Error(j.error || "Sheet refused the data");
    } catch (err) {
      // The reply may have been lost even though the data arrived: ask the Sheet.
      const res = await fetchWithTimeout(
        `${CONFIG.GSHEET_URL}?action=check&sid=${encodeURIComponent(SUBMISSION_ID)}`, {}, 15000);
      const j = await res.json();
      if (j.ok && j.saved) return true;
      throw err;
    }
  }
  // local
  jsPsych.data.get().localSave("json", filename);
  return true;
}

const save = {
  type: jsPsychCallFunction,
  on_finish: flattenValue,
  async: true,
  func: async (done) => {
    const el = jsPsych.getDisplayElement();
    el.innerHTML = `<div class="page">${TEXT.saving}</div>`;
    const filename = `${CONFIG.STUDY_ID}_${PID}.json`;
    const dataString = jsPsych.data.get().json();
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await saveOnce(dataString, filename);
        S.saveOK = true;
        done({ trial_role: "save", save_ok: true, attempts: attempt });
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    // Saving failed: offer a download so nothing is lost
    S.saveOK = false;
    el.innerHTML = `<div class="page">${TEXT.save_error}<p class="pp-code">${esc(PID)}</p>
      <button class="jspsych-btn" id="dl">Download my responses as a file</button>
      <p class="muted">${esc(String(lastErr))}</p></div>`;
    el.querySelector("#dl").addEventListener("click", () => jsPsych.data.get().localSave("json", filename));
    // stays on this screen; done() is not called on purpose
  },
  conditional_function: () => S.saveChoice === true,
};

const endScreen = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: () => `<div class="page">${S.saveChoice ? TEXT.end_saved : TEXT.end_not_saved}</div>`,
  choices: "NO_KEYS",
  data: { trial_role: "end" },
};

/* ====================================================================
 * Run
 * ==================================================================== */
if (SAVE_MODE === "gsheet" && !GSHEET_READY) {
  // Never run a live session that cannot save its data.
  document.body.innerHTML = `<div class="page" style="margin-top:3em">
    <h2>This study is not open yet</h2>
    <p>Thank you for your interest. The study link is not ready to collect responses.</p>
    <p class="muted">For the research team: set <code>GSHEET_URL</code> in <code>config.js</code>,
    or test with <code>?debug=1</code>.</p></div>`;
} else jsPsych.run([
  browserCheck,
  assignGroup,
  consent,
  screen(TEXT.practice_intro, "Start practice", "practice_intro"),
  practiceLoop,
  recencyTask,
  reminderTask,
  nameGenerator,
  controlGenerator,
  whoElse,
  buildPersons,
  personBlock,
  checks,
  debrief,
  summarise,
  save,
  endScreen,
]);
