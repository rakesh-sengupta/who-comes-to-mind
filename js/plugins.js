/*
 * Custom jsPsych 8 plugins for "Who Comes to Mind First?"
 * Computational Cognition Laboratory, SIAS, Krea University
 *
 *   jsPsychTimedNameGenerator  - keypress-then-type name generator (SPACE, then type a code)
 *   jsPsychListEntry           - list of short entries with an optional per-row question
 *   jsPsychTimedWriting        - free-writing box with a minimum time before Continue
 *
 * All times are in milliseconds, measured with performance.now().
 */

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */
var EgoRecallUtils = (function () {
  /**
   * Check a typed entry. Returns null if fine, otherwise a message to show.
   * codeMode = true applies the privacy rules for codes that stand for people:
   * at least `minLength` characters and nothing that looks like initials.
   */
  function checkEntry(raw, opts) {
    const s = (raw || "").trim();
    const existing = (opts.existing || []).map((x) => x.trim().toLowerCase());
    const forbidden = (opts.forbidden || []).map((x) => x.trim().toLowerCase());
    if (!s) return "Please type something first.";
    if (opts.codeMode) {
      if (s.length < opts.minLength) {
        return `Please use a code of at least ${opts.minLength} characters (a word, not initials).`;
      }
      const capsInitials = /^[A-Z]{2,3}\.?$/; // RS, RKS
      const dottedInitials = /^([A-Za-z][.\s]+){1,3}[A-Za-z]?\.?$/; // R.S., R S, r. k. s
      if (capsInitials.test(s) || dottedInitials.test(s)) {
        return "That looks like initials. Please use a word that only you would understand, not initials.";
      }
    }
    if (existing.includes(s.toLowerCase())) {
      return "You have already used that one. Please use a different code for each.";
    }
    if (forbidden.includes(s.toLowerCase())) {
      return opts.forbiddenMessage || "You already listed that one earlier.";
    }
    return null;
  }

  function countWords(text) {
    const t = (text || "").trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Progress bar that fills over `ms`; calls onDone when full. */
  function startMinTimer(jsPsych, barEl, ms, onDone) {
    if (!ms || ms <= 0) {
      if (barEl) barEl.style.width = "100%";
      onDone();
      return;
    }
    const start = performance.now();
    const tick = () => {
      const frac = Math.min(1, (performance.now() - start) / ms);
      if (barEl) barEl.style.width = (frac * 100).toFixed(1) + "%";
      if (frac < 1) jsPsych.pluginAPI.setTimeout(tick, 250);
      else onDone();
    };
    tick();
  }

  return { checkEntry, countWords, escapeHtml, startMinTimer };
})();

/* ------------------------------------------------------------------ */
/* Timed name generator                                                 */
/* ------------------------------------------------------------------ */
var jsPsychTimedNameGenerator = (function (jspsych) {
  "use strict";
  const T = jspsych.ParameterType;

  const info = {
    name: "timed-name-generator",
    version: "1.0.0",
    parameters: {
      /** Label stored with the data, e.g. "close_people", "places_control", "practice_fruits". */
      question_id: { type: T.STRING, default: "" },
      /** The question shown on screen. Its onset is time zero. */
      prompt: { type: T.HTML_STRING, default: "" },
      /** Maximum number of entries. */
      max_items: { type: T.INT, default: 5 },
      /** Apply the privacy rules for codes that stand for people. */
      code_mode: { type: T.BOOL, default: true },
      min_code_length: { type: T.INT, default: 3 },
      /** Words used in on-screen messages. */
      item_word: { type: T.STRING, default: "person" },
      waiting_message: { type: T.HTML_STRING, default: "Press <b>SPACE</b> as soon as the next one comes to mind." },
      first_waiting_message: { type: T.HTML_STRING, default: null },
      input_label: { type: T.HTML_STRING, default: "Type a short code, then press <b>ENTER</b>." },
      done_label: { type: T.STRING, default: "No more come to mind" },
      done_confirm_label: { type: T.STRING, default: "Click again to confirm you are finished" },
      /** End the trial if no SPACE press for this long (ms). null = no limit. */
      timeout_ms: { type: T.INT, default: null },
      /** Show the "done" button at all (it is always hidden while typing). */
      show_done_button: { type: T.BOOL, default: true },
    },
    data: {
      question_id: { type: T.STRING },
      items: { type: T.COMPLEX },
      n_items: { type: T.INT },
      codes: { type: T.STRING },
      first_rt: { type: T.FLOAT },
      false_starts: { type: T.COMPLEX },
      n_false_starts: { type: T.INT },
      n_keys_before_space: { type: T.INT },
      ended_by: { type: T.STRING },
      trial_duration: { type: T.FLOAT },
    },
  };

  class TimedNameGeneratorPlugin {
    static info = info;
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const esc = EgoRecallUtils.escapeHtml;
      display_element.innerHTML = `
        <div class="ng-wrap">
          <div class="ng-question" id="ng-question">${trial.prompt}</div>
          <div class="ng-status" id="ng-status" aria-live="polite"></div>
          <div class="ng-input-area" id="ng-input-area" hidden>
            <label for="ng-input" class="ng-input-label">${trial.input_label}</label>
            <input id="ng-input" type="text" maxlength="30" autocomplete="off" spellcheck="false">
            <div class="ng-error" id="ng-error" aria-live="assertive"></div>
            <div class="ng-hint">Pressed SPACE by mistake? Press <b>ESC</b>.</div>
          </div>
          <ol class="ng-list" id="ng-list"></ol>
          <div class="ng-count" id="ng-count"></div>
          <div class="ng-done-row">
            <button type="button" class="jspsych-btn ng-done" id="ng-done" tabindex="-1">${esc(trial.done_label)}</button>
          </div>
        </div>`;

      const statusEl = display_element.querySelector("#ng-status");
      const inputArea = display_element.querySelector("#ng-input-area");
      const input = display_element.querySelector("#ng-input");
      const errorEl = display_element.querySelector("#ng-error");
      const listEl = display_element.querySelector("#ng-list");
      const countEl = display_element.querySelector("#ng-count");
      const doneBtn = display_element.querySelector("#ng-done");

      const items = [];
      const falseStarts = [];
      let state = "init"; // init | waiting | typing | ended
      let onset = null;
      let readyTime = null; // when the participant became free to retrieve the next item
      let pressTime = null;
      let firstKeyTime = null;
      let keysBeforeSpace = 0;
      let doneArmed = false;
      let timeoutHandle = null;

      const updateCount = () => {
        countEl.textContent = `${items.length} of ${trial.max_items}`;
      };

      // resetReady = false after an ESC false start, so the next latency still
      // counts from the previous ENTER (or the question onset).
      const enterWaiting = (resetReady = true) => {
        state = "waiting";
        if (resetReady || readyTime === null) readyTime = performance.now();
        inputArea.hidden = true;
        input.value = "";
        errorEl.textContent = "";
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        statusEl.innerHTML =
          items.length === 0 && trial.first_waiting_message ? trial.first_waiting_message : trial.waiting_message;
        doneBtn.hidden = !trial.show_done_button;
        doneArmed = false;
        doneBtn.textContent = trial.done_label;
        if (trial.timeout_ms !== null) {
          timeoutHandle = this.jsPsych.pluginAPI.setTimeout(() => {
            if (state === "waiting") end("timeout");
          }, trial.timeout_ms);
        }
      };

      const enterTyping = (t) => {
        state = "typing";
        pressTime = t;
        firstKeyTime = null;
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        doneBtn.hidden = true;
        statusEl.innerHTML = "";
        inputArea.hidden = false;
        input.value = "";
        errorEl.textContent = "";
        input.focus();
      };

      const submitItem = () => {
        const msg = EgoRecallUtils.checkEntry(input.value, {
          codeMode: trial.code_mode,
          minLength: trial.min_code_length,
          existing: items.map((x) => x.code),
        });
        if (msg) {
          errorEl.textContent = msg;
          return;
        }
        const now = performance.now();
        const code = input.value.trim();
        items.push({
          position: items.length + 1,
          code: code,
          rt_from_onset: Math.round(pressTime - onset), // question onset -> SPACE
          latency_from_ready: Math.round(pressTime - readyTime), // previous ENTER (or onset) -> SPACE
          first_key_ms: firstKeyTime === null ? null : Math.round(firstKeyTime - pressTime),
          typing_ms: Math.round(now - pressTime), // SPACE -> ENTER
          submit_from_onset: Math.round(now - onset),
        });
        const li = document.createElement("li");
        li.textContent = code;
        listEl.appendChild(li);
        updateCount();
        if (items.length >= trial.max_items) end("max_items");
        else enterWaiting();
      };

      const onKeyDown = (e) => {
        // If the experiment was aborted mid-trial, this screen is gone: clean up.
        if (!document.body.contains(statusEl)) {
          document.removeEventListener("keydown", onKeyDown);
          return;
        }
        if (state === "waiting") {
          if (e.code === "Space" || e.key === " ") {
            e.preventDefault();
            if (e.repeat) return;
            enterTyping(performance.now());
          } else if (e.key && e.key.length === 1) {
            keysBeforeSpace += 1;
            statusEl.innerHTML = "Press <b>SPACE</b> first, then type.";
          }
        }
      };

      const onInputKey = (e) => {
        if (state !== "typing") return;
        if (e.key === "Enter") {
          e.preventDefault();
          submitItem();
        } else if (e.key === "Escape") {
          e.preventDefault();
          falseStarts.push({
            after_position: items.length,
            press_from_onset: Math.round(pressTime - onset),
            cancel_from_onset: Math.round(performance.now() - onset),
            typed: input.value,
          });
          enterWaiting(false);
        }
      };

      const onInput = () => {
        if (firstKeyTime === null) firstKeyTime = performance.now();
        errorEl.textContent = "";
      };

      const onDone = (e) => {
        e.preventDefault();
        doneBtn.blur();
        if (state !== "waiting") return;
        if (!doneArmed) {
          doneArmed = true;
          doneBtn.textContent = trial.done_confirm_label;
          return;
        }
        end("done_button");
      };

      const end = (how) => {
        if (state === "ended") return;
        state = "ended";
        document.removeEventListener("keydown", onKeyDown);
        this.jsPsych.pluginAPI.clearAllTimeouts();
        const data = {
          question_id: trial.question_id,
          items: items,
          n_items: items.length,
          codes: items.map((x) => x.code).join(" | "),
          first_rt: items.length ? items[0].rt_from_onset : null,
          false_starts: falseStarts,
          n_false_starts: falseStarts.length,
          n_keys_before_space: keysBeforeSpace,
          ended_by: how,
          trial_duration: Math.round(performance.now() - onset),
        };
        display_element.innerHTML = "";
        this.jsPsych.finishTrial(data);
      };

      document.addEventListener("keydown", onKeyDown);
      input.addEventListener("keydown", onInputKey);
      input.addEventListener("input", onInput);
      doneBtn.addEventListener("click", onDone);
      updateCount();
      doneBtn.hidden = true;

      // Time zero = first frame on which the question is painted.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onset = performance.now();
          enterWaiting();
        });
      });
    }
  }

  return TimedNameGeneratorPlugin;
})(jsPsychModule);

/* ------------------------------------------------------------------ */
/* List entry (recency task, "who else came to mind")                   */
/* ------------------------------------------------------------------ */
var jsPsychListEntry = (function (jspsych) {
  "use strict";
  const T = jspsych.ParameterType;

  const info = {
    name: "list-entry",
    version: "1.0.0",
    parameters: {
      task_id: { type: T.STRING, default: "" },
      preamble: { type: T.HTML_STRING, default: "" },
      entry_label: { type: T.STRING, default: "Entry" },
      placeholder: { type: T.STRING, default: "" },
      n_rows_start: { type: T.INT, default: 5 },
      max_rows: { type: T.INT, default: 20 },
      code_mode: { type: T.BOOL, default: false },
      min_code_length: { type: T.INT, default: 3 },
      /** Optional question asked next to each row: {name, label, options: [..]} */
      row_question: { type: T.OBJECT, default: null },
      /** Codes that must not be reused here (e.g. already listed). */
      forbidden: { type: T.COMPLEX, default: [] },
      forbidden_message: { type: T.STRING, default: "You already listed that one." },
      /** Optional "nothing to add" tick box. */
      none_label: { type: T.STRING, default: null },
      /** Minimum time before Continue becomes available (ms). */
      min_time_ms: { type: T.INT, default: 0 },
      min_time_message: { type: T.HTML_STRING, default: "" },
      /** If nothing has been entered, ask once before moving on (participants may skip). */
      empty_nudge: { type: T.HTML_STRING, default: "You have not listed anything. Click Continue again to move on anyway." },
      button_label: { type: T.STRING, default: "Continue" },
    },
    data: {
      task_id: { type: T.STRING },
      entries: { type: T.COMPLEX },
      n_entries: { type: T.INT },
      none_checked: { type: T.BOOL },
      time_on_task: { type: T.FLOAT },
      time_to_first_key: { type: T.FLOAT },
      n_rows_added: { type: T.INT },
    },
  };

  class ListEntryPlugin {
    static info = info;
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const esc = EgoRecallUtils.escapeHtml;
      const start = performance.now();
      let firstKey = null;
      let rowsAdded = 0;
      let timeReady = false;
      let nudged = false;

      const rq = trial.row_question;
      const rowHtml = (i) => {
        let q = "";
        if (rq) {
          q = `<div class="le-rowq"><span class="le-rowq-label">${esc(rq.label)}</span>` +
            rq.options
              .map(
                (o, k) =>
                  `<label class="le-radio"><input type="radio" name="${rq.name}_${i}" value="${esc(o)}"> ${esc(o)}</label>`
              )
              .join("") +
            `</div>`;
        }
        return `<div class="le-row" data-row="${i}">
            <label class="le-num" for="le-input-${i}">${i + 1}.</label>
            <div class="le-cell">
              <input type="text" id="le-input-${i}" class="le-input" maxlength="40" autocomplete="off"
                     spellcheck="false" placeholder="${esc(trial.placeholder)}" aria-label="${esc(trial.entry_label)} ${i + 1}">
              ${q}
              <div class="le-error" id="le-error-${i}"></div>
            </div>
          </div>`;
      };

      display_element.innerHTML = `
        <div class="le-wrap">
          <div class="le-preamble">${trial.preamble}</div>
          ${trial.none_label ? `<label class="le-none"><input type="checkbox" id="le-none"> ${esc(trial.none_label)}</label>` : ""}
          <div id="le-rows"></div>
          <button type="button" class="jspsych-btn le-add" id="le-add">+ Add another row</button>
          <div class="min-timer" ${trial.min_time_ms > 0 ? "" : "hidden"}>
            <div class="min-timer-msg">${trial.min_time_message}</div>
            <div class="min-timer-track"><div class="min-timer-bar" id="le-bar"></div></div>
          </div>
          <div class="le-nudge" id="le-nudge" aria-live="polite"></div>
          <button type="button" class="jspsych-btn le-continue" id="le-continue" disabled>${esc(trial.button_label)}</button>
        </div>`;

      const rowsEl = display_element.querySelector("#le-rows");
      const addBtn = display_element.querySelector("#le-add");
      const contBtn = display_element.querySelector("#le-continue");
      const noneBox = display_element.querySelector("#le-none");
      const nudgeEl = display_element.querySelector("#le-nudge");
      let nRows = 0;

      const addRow = () => {
        if (nRows >= trial.max_rows) return;
        rowsEl.insertAdjacentHTML("beforeend", rowHtml(nRows));
        nRows += 1;
        if (nRows >= trial.max_rows) addBtn.hidden = true;
      };
      for (let i = 0; i < trial.n_rows_start; i++) addRow();

      addBtn.addEventListener("click", () => {
        addRow();
        rowsAdded += 1;
        const last = display_element.querySelector(`#le-input-${nRows - 1}`);
        if (last) last.focus();
      });

      display_element.addEventListener("input", (e) => {
        if (firstKey === null && e.target.classList.contains("le-input")) firstKey = performance.now();
      });
      // ENTER moves to the next row instead of doing nothing
      display_element.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.classList.contains("le-input")) {
          e.preventDefault();
          const i = Number(e.target.id.split("-").pop());
          let next = display_element.querySelector(`#le-input-${i + 1}`);
          if (!next && nRows < trial.max_rows) {
            addRow();
            rowsAdded += 1;
            next = display_element.querySelector(`#le-input-${i + 1}`);
          }
          if (next) next.focus();
        }
      });

      if (noneBox) {
        noneBox.addEventListener("change", () => {
          display_element.querySelectorAll(".le-row input, .le-add").forEach((el) => (el.disabled = noneBox.checked));
        });
      }

      EgoRecallUtils.startMinTimer(this.jsPsych, display_element.querySelector("#le-bar"), trial.min_time_ms, () => {
        timeReady = true;
        contBtn.disabled = false;
        const msg = display_element.querySelector(".min-timer-msg");
        if (msg && trial.min_time_ms > 0) msg.innerHTML = "You can continue when you are ready.";
      });

      contBtn.addEventListener("click", () => {
        if (!timeReady) return;
        const noneChecked = noneBox ? noneBox.checked : false;
        const entries = [];
        let bad = false;
        display_element.querySelectorAll(".le-error").forEach((el) => (el.textContent = ""));
        if (!noneChecked) {
          for (let i = 0; i < nRows; i++) {
            const val = display_element.querySelector(`#le-input-${i}`).value;
            if (!val.trim()) continue;
            const msg = EgoRecallUtils.checkEntry(val, {
              codeMode: trial.code_mode,
              minLength: trial.min_code_length,
              existing: entries.map((x) => x.text),
              forbidden: trial.forbidden,
              forbiddenMessage: trial.forbidden_message,
            });
            if (msg) {
              display_element.querySelector(`#le-error-${i}`).textContent = msg;
              bad = true;
              continue;
            }
            const entry = { row: i + 1, text: val.trim() };
            if (rq) {
              const chosen = display_element.querySelector(`input[name="${rq.name}_${i}"]:checked`);
              entry[rq.name] = chosen ? chosen.value : null;
            }
            entries.push(entry);
          }
        }
        if (bad) {
          nudgeEl.textContent = "Please fix the highlighted rows.";
          return;
        }
        if (!noneChecked && entries.length === 0 && trial.empty_nudge && !nudged) {
          nudged = true;
          nudgeEl.innerHTML = trial.empty_nudge;
          return;
        }
        const end = performance.now();
        display_element.innerHTML = "";
        this.jsPsych.finishTrial({
          task_id: trial.task_id,
          entries: entries,
          n_entries: entries.length,
          none_checked: noneChecked,
          time_on_task: Math.round(end - start),
          time_to_first_key: firstKey === null ? null : Math.round(firstKey - start),
          n_rows_added: rowsAdded,
        });
      });

      const first = display_element.querySelector("#le-input-0");
      if (first) first.focus();
    }
  }

  return ListEntryPlugin;
})(jsPsychModule);

/* ------------------------------------------------------------------ */
/* Timed writing (reminder task)                                        */
/* ------------------------------------------------------------------ */
var jsPsychTimedWriting = (function (jspsych) {
  "use strict";
  const T = jspsych.ParameterType;

  const info = {
    name: "timed-writing",
    version: "1.0.0",
    parameters: {
      task_id: { type: T.STRING, default: "" },
      preamble: { type: T.HTML_STRING, default: "" },
      rows: { type: T.INT, default: 10 },
      min_time_ms: { type: T.INT, default: 0 },
      min_time_message: { type: T.HTML_STRING, default: "" },
      /** If fewer characters than this, ask once before moving on (participants may skip). */
      nudge_chars: { type: T.INT, default: 0 },
      nudge_message: { type: T.HTML_STRING, default: "Could you write a little more? If you would rather not, click Continue again." },
      button_label: { type: T.STRING, default: "Continue" },
    },
    data: {
      task_id: { type: T.STRING },
      text: { type: T.STRING },
      n_chars: { type: T.INT },
      n_words: { type: T.INT },
      n_keystrokes: { type: T.INT },
      n_pastes: { type: T.INT },
      time_to_first_key: { type: T.FLOAT },
      time_on_task: { type: T.FLOAT },
      nudged: { type: T.BOOL },
    },
  };

  class TimedWritingPlugin {
    static info = info;
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const esc = EgoRecallUtils.escapeHtml;
      const start = performance.now();
      let firstKey = null;
      let keystrokes = 0;
      let pastes = 0;
      let timeReady = false;
      let nudged = false;

      display_element.innerHTML = `
        <div class="tw-wrap">
          <div class="tw-preamble">${trial.preamble}</div>
          <textarea id="tw-text" rows="${trial.rows}" spellcheck="true" aria-label="Your writing"></textarea>
          <div class="min-timer" ${trial.min_time_ms > 0 ? "" : "hidden"}>
            <div class="min-timer-msg">${trial.min_time_message}</div>
            <div class="min-timer-track"><div class="min-timer-bar" id="tw-bar"></div></div>
          </div>
          <div class="le-nudge" id="tw-nudge" aria-live="polite"></div>
          <button type="button" class="jspsych-btn" id="tw-continue" disabled>${esc(trial.button_label)}</button>
        </div>`;

      const ta = display_element.querySelector("#tw-text");
      const contBtn = display_element.querySelector("#tw-continue");
      const nudgeEl = display_element.querySelector("#tw-nudge");

      ta.addEventListener("keydown", (e) => {
        if (firstKey === null) firstKey = performance.now();
        if (e.key && (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter")) keystrokes += 1;
      });
      ta.addEventListener("paste", () => (pastes += 1));

      EgoRecallUtils.startMinTimer(this.jsPsych, display_element.querySelector("#tw-bar"), trial.min_time_ms, () => {
        timeReady = true;
        contBtn.disabled = false;
        const msg = display_element.querySelector(".min-timer-msg");
        if (msg && trial.min_time_ms > 0) msg.innerHTML = "You can continue when you have finished your thought.";
      });

      contBtn.addEventListener("click", () => {
        if (!timeReady) return;
        const text = ta.value;
        if (trial.nudge_chars > 0 && text.trim().length < trial.nudge_chars && !nudged) {
          nudged = true;
          nudgeEl.innerHTML = trial.nudge_message;
          return;
        }
        const end = performance.now();
        display_element.innerHTML = "";
        this.jsPsych.finishTrial({
          task_id: trial.task_id,
          text: text,
          n_chars: text.trim().length,
          n_words: EgoRecallUtils.countWords(text),
          n_keystrokes: keystrokes,
          n_pastes: pastes,
          time_to_first_key: firstKey === null ? null : Math.round(firstKey - start),
          time_on_task: Math.round(end - start),
          nudged: nudged,
        });
      });

      ta.focus();
    }
  }

  return TimedWritingPlugin;
})(jsPsychModule);
