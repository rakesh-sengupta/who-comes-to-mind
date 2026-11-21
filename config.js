/*
 * Who Comes to Mind First? — settings and wording
 * ------------------------------------------------
 * Everything you are likely to change after the Week 3 pilot lives here:
 * how data are saved, timings, and every piece of text participants read.
 * Text in [SQUARE BRACKETS] is a placeholder to fill in before going live.
 */
const CONFIG = {
  STUDY_ID: "who-comes-to-mind",
  STUDY_VERSION: "0.1.0-pilot",

  /* ---------------- Saving ----------------
   * "local"    : downloads a .json file at the end (pilot / testing on your own laptop)
   * "datapipe" : saves to OSF through pipe.jspsych.org (set DATAPIPE_EXPERIMENT_ID)
   * "jatos"    : saves to a JATOS server (add <script src="jatos.js"> in index.html)
   * Can be overridden from the URL with ?save=local. With ?debug=1 the default is "local",
   * so test runs on the live site never land in the OSF data folder.
   */
  SAVE_MODE: "datapipe", // GitHub Pages has no server of its own, so live data go to OSF via DataPipe
  DATAPIPE_EXPERIMENT_ID: "[12-character DataPipe ID]",
  /* If true and SAVE_MODE is "datapipe", DataPipe hands out groups in rotation
   * (set "number of conditions" = 4 in DataPipe). Otherwise groups are random.
   * A ?group=1..4 URL parameter always wins (useful for piloting). */
  DATAPIPE_BALANCED_ASSIGNMENT: true,

  /* ---------------- Timing (seconds) ---------------- */
  TIMING: {
    RECENCY_MIN_S: 120, // Continue appears after this long (task is "about 3 minutes")
    REMINDER_MIN_S: 180, // writing task is "about 4 minutes"
    NG_TIMEOUT_S: 90, // name generator ends if no SPACE for this long
    FIXATION_MS: 1000, // "+" shown before each timed question
  },
  /* Used instead when the URL has ?debug=1 */
  DEBUG_TIMING: { RECENCY_MIN_S: 3, REMINDER_MIN_S: 3, NG_TIMEOUT_S: 20, FIXATION_MS: 300 },

  MAX_PEOPLE: 5,
  MAX_PLACES: 5,
  PRACTICE_ITEMS: 3,
  MIN_CODE_LENGTH: 3,
  WRITING_NUDGE_CHARS: 150, // fewer characters than this -> one gentle "could you write a little more?"

  /* Group numbers follow the concept note's table */
  GROUPS: {
    1: { recency: "low", reminder: "neutral" },
    2: { recency: "high", reminder: "neutral" },
    3: { recency: "low", reminder: "relational" },
    4: { recency: "high", reminder: "relational" },
  },

  CONTACTS: {
    pi: "Dr Rakesh Sengupta (rakesh.sengupta@krea.edu.in)",
    student: "Namrita Thakur ([email])",
    support: "[Krea counselling / wellness centre contact]",
    irb: "[Krea IRB approval number]",
  },
};

/* ====================================================================
 * Participant-facing text
 * ==================================================================== */
const CODE_EXPLAINER = `
  <div class="box box-blue">
    <p><b>What is a code?</b> A word or two that tells <i>you</i> who someone is,
    but would not tell anyone else.</p>
    <p>Not their name. Not their initials.</p>
    <p>Examples: <span class="eg">chai-friend</span> <span class="eg">blue-scooter</span>
    <span class="eg">cousin-in-Pune</span> <span class="eg">lab-Tuesday</span></p>
  </div>`;

const TEXT = {
  device_exclusion: `
    <p>This study needs a laptop or desktop computer with a keyboard,
    and a browser window at least 800 pixels wide.</p>
    <p>Please open the link again on a computer. Thank you!</p>`,

  consent: `
    <h2>Who comes to mind first?</h2>
    <p class="muted">Computational Cognition Laboratory, Krea University &middot; IRB approval: ${CONFIG.CONTACTS.irb}</p>
    <div class="box">
      <p><b>What you will do.</b> Two short writing tasks, then you will name some people
      and places as they come to mind. It takes about 20 minutes.</p>
      <p><b>Other people's privacy.</b> You will never type anyone's name or initials.
      You will use short codes that only you understand.</p>
      <p><b>Your choice.</b> You can skip any question. You can stop at any time with the
      <i>Stop the study</i> button at the top right. If you stop, nothing you typed is saved.</p>
      <p><b>Your data.</b> Stored without your name. Only the project team can see it.</p>
      <p><b>Thinking about close people can bring up feelings.</b> If that happens, you can stop.
      Support: ${CONFIG.CONTACTS.support}.</p>
      <p><b>Questions?</b> ${CONFIG.CONTACTS.pi}; ${CONFIG.CONTACTS.student}.</p>
    </div>`,

  not_consented: `
    <h2>Thank you</h2>
    <p>You have chosen not to take part, or you are under 18. Nothing has been saved.</p>
    <p>You can close this window.</p>`,

  withdrawn: `
    <h2>You have stopped the study</h2>
    <p>Nothing you typed has been saved.</p>
    <p>If anything in the study upset you, please reach out: ${CONFIG.CONTACTS.support}.</p>
    <p>Questions: ${CONFIG.CONTACTS.pi}.</p>
    <p>You can close this window.</p>`,

  practice_intro: `
    <h2>Practice first</h2>
    <p>Later you will name things <b>as they come to mind</b>. Here is how it works:</p>
    <ol class="steps">
      <li>A question appears.</li>
      <li>The moment an answer comes to mind, press <span class="key">SPACE</span>.</li>
      <li>A box appears. Type your answer and press <span class="key">ENTER</span>.</li>
      <li>Repeat for the next answer.</li>
    </ol>
    <p>Press SPACE <b>before</b> you start typing. The practice is not timed.</p>
    <p>Let's try it: you will name three fruits.</p>`,

  practice_prompt: `<p class="q-big">Name three fruits.</p>`,

  practice_after: `
    <h2>How did that go?</h2>
    <p>Remember: <span class="key">SPACE</span> the moment something comes to mind,
    then type, then <span class="key">ENTER</span>.</p>`,

  recency_high: `
    <h2>Task 1: New people</h2>
    <p>Think about the <b>last two weeks</b>.</p>
    <p>List the people you met <b>for the first time</b> in the last two weeks.
    Anyone counts: someone in a class, a shop, an event, online.</p>
    ${CODE_EXPLAINER}
    <p>One person per row. List as many as you can.</p>`,

  recency_low: `
    <h2>Task 1: New places</h2>
    <p>Think about the <b>last two weeks</b>.</p>
    <p>List the places you visited <b>for the first time</b> in the last two weeks.
    Anything counts: a café, a shop, a building on campus, a town, a website you had not used before.</p>
    <p>One place per row. A few words is enough. List as many as you can.</p>`,

  recency_min_message: `Keep listing. The Continue button turns on after about {MIN}.`,

  reminder_relational: `
    <h2>Task 2: Writing</h2>
    <p>Think about what it means to be a person who has close relationships.
    Write about the qualities that make a close relationship valuable.</p>
    <div class="box box-yellow"><p><b>Please do not name or describe any specific person.</b></p></div>
    <p>Write in full sentences. Spelling does not matter.</p>`,

  reminder_neutral: `
    <h2>Task 2: Writing</h2>
    <p>Write about how you usually plan your week.</p>
    <p>Write in full sentences. Spelling does not matter.</p>`,

  reminder_min_message: `Keep writing. The Continue button turns on after about {MIN}.`,

  ng_intro: `
    <h2>Task 3: Who comes to mind</h2>
    <p>Next you will see a question about <b>the people closest to you</b>.</p>
    <ol class="steps">
      <li>Press <span class="key">SPACE</span> the <b>moment</b> the first person comes to mind.</li>
      <li>Type a <b>code</b> for them and press <span class="key">ENTER</span>.</li>
      <li>Repeat for up to five people.</li>
    </ol>
    ${CODE_EXPLAINER}
    <p>This part is timed, so keep your fingers near SPACE. There are no right or wrong answers.</p>
    <p>If you cannot think of more people, click <i>No one else comes to mind</i>.</p>`,

  ng_prompt: `<p class="q-big">Who are the people closest to you?</p>`,

  control_intro: `
    <h2>Task 4: Places</h2>
    <p>Same procedure, now with <b>places</b>.</p>
    <p>Press <span class="key">SPACE</span> the moment a place comes to mind, type it, press
    <span class="key">ENTER</span>. Up to five places. A few words is enough.</p>`,

  control_prompt: `<p class="q-big">Name five places you go to regularly.</p>`,

  who_else: `
    <h2>Anyone else?</h2>
    <p>While you were naming the people closest to you, <b>did anyone else come to mind</b>
    whom you did not list? This happens a lot, and it is exactly what we are interested in.</p>
    <p>Type a code for each one (not their name or initials). For each, tell us whether you
    <b>deliberately set them aside</b>.</p>`,

  person_intro: `
    <h2>A few questions about each person</h2>
    <p>Next you will see each code you typed, one at a time, with five short questions.</p>
    <p>You can skip any question.</p>`,

  checks_preamble: `<h2>Almost done</h2><p>A few questions about the session.</p>`,

  debrief: `
    <h2>What this study was about</h2>
    <p>Thank you! Here is what we are studying.</p>
    <p>When people are asked to name the people closest to them, there is often a short pause,
    and sometimes someone they met recently pops into their head first. We think this happens
    because routine, familiar relationships stop feeling like "news" to memory, while new people
    stand out.</p>
    <p>People in this study were randomly put into one of four groups. In <b>Task 1</b>, half listed
    <i>new people</i> and half listed <i>new places</i>. In <b>Task 2</b>, half wrote about
    <i>close relationships in general</i> and half wrote about <i>planning their week</i>.
    We are testing whether thinking about new people slows down naming close people, and whether
    a reminder of close relationships speeds it up.</p>
    <p>The places question measured your general typing-and-pressing speed, so we can compare fairly.</p>
    <p>We did not tell you all of this at the start because knowing it could have changed how you answered.</p>
    <div class="box">
      <p>If the study brought up difficult feelings, please reach out: ${CONFIG.CONTACTS.support}.</p>
      <p>Questions: ${CONFIG.CONTACTS.pi}; ${CONFIG.CONTACTS.student}.</p>
    </div>
    <p>Now that you know what the study is about, you can still choose <b>not</b> to have your
    responses saved.</p>`,

  saving: `<p>Saving your responses&hellip; please do not close this window.</p>`,

  end_saved: `
    <h2>Thank you!</h2>
    <p>Your responses have been saved. You can close this window.</p>
    <p class="muted">Please do not tell other students what the study is about until data collection has finished.</p>`,

  end_not_saved: `
    <h2>Thank you</h2>
    <p>Your responses have <b>not</b> been saved. You can close this window.</p>`,

  save_error: `
    <h2>Something went wrong while saving</h2>
    <p>Please email ${CONFIG.CONTACTS.pi} and mention the code below. Do not close this window yet.</p>`,
};
