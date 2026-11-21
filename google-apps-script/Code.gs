/**
 * Who Comes to Mind First? — data receiver for Google Sheets + Drive
 * -------------------------------------------------------------------
 * Paste this whole file into a Google Sheet: Extensions -> Apps Script.
 * Deploy it as a Web app (Execute as: Me, Who has access: Anyone) and
 * copy the /exec URL into GSHEET_URL in config.js. See the README for the steps.
 *
 * For each completed session it:
 *   - saves the full raw data as a .json file in a Drive folder next to this Sheet
 *   - adds one row to the "participants" tab, one row per person to "persons",
 *     and one row per SPACE press to "items_close"
 * It also hands out groups 1-4 so that they stay balanced ("assignments" tab).
 *
 * The participant's browser can only ADD rows. It cannot read or change anything.
 * If you edit this file, use Deploy -> Manage deployments -> Edit -> Version: New version,
 * so the same URL keeps working.
 */

const STUDY_ID = "who-comes-to-mind";
const N_GROUPS = 4;
const PENDING_MINUTES = 45; // a started-but-unfinished session counts toward its group for this long
const FOLDER_NAME = "who-comes-to-mind raw data";

/* ---------------- web app entry points ---------------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === "condition") return json_(withLock_(() => assignGroup_(String(p.pid || ""))));
    if (p.action === "check") return json_({ ok: true, saved: isSaved_(String(p.sid || "")) });
    return json_({ ok: true, message: "Receiver for " + STUDY_ID + " is running." });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.study_id !== STUDY_ID) throw new Error("wrong study_id");
    const sid = String(body.submission_id || "");
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(sid)) throw new Error("bad submission_id");
    const trials = JSON.parse(body.data);
    if (!Array.isArray(trials)) throw new Error("data is not a list of trials");
    const summ = trials.filter((t) => t.trial_role === "summary")[0];
    if (!summ) throw new Error("no summary row in data");

    return json_(
      withLock_(() => {
        if (isSaved_(sid)) return { ok: true, duplicate: true }; // a retry of a session already saved
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const fileId = saveRawFile_(ss, String(body.filename || sid + ".json"), body.data);
        const base = { submission_id: sid, received: new Date().toISOString() };
        const participant = Object.assign({}, base, summ.summary, { debug: !!summ.debug, raw_file_id: fileId });
        appendRows_(sheet_(ss, "persons"), (summ.persons || []).map((p) => Object.assign({ submission_id: sid }, p)));
        const main = trials.filter((t) => t.trial_role === "ng_main")[0];
        if (main && main.items) {
          const s = summ.summary;
          appendRows_(
            sheet_(ss, "items_close"),
            main.items.map((it) =>
              Object.assign({ submission_id: sid, pid: s.pid, group: s.group, recency: s.recency, reminder: s.reminder }, it)
            )
          );
        }
        // written last, so a session only counts as saved once everything else is in
        appendRows_(sheet_(ss, "participants"), [participant]);
        return { ok: true };
      })
    );
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------------- group assignment ---------------- */

function assignGroup_(pid) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const completed = readTable_(sheet_(ss, "participants")).filter((r) => String(r.debug) !== "true");
  const donePids = {};
  const score = [];
  for (let g = 1; g <= N_GROUPS; g++) score[g] = 0;
  completed.forEach((r) => {
    const g = Number(r.group);
    if (g >= 1 && g <= N_GROUPS) score[g] += 1;
    donePids[String(r.pid)] = true;
  });
  const cutoff = Date.now() - PENDING_MINUTES * 60 * 1000;
  const asg = sheet_(ss, "assignments");
  readTable_(asg).forEach((r) => {
    const g = Number(r.group);
    if (new Date(r.time).getTime() >= cutoff && !donePids[String(r.pid)] && g >= 1 && g <= N_GROUPS) score[g] += 1;
  });
  let best = Infinity;
  for (let g = 1; g <= N_GROUPS; g++) best = Math.min(best, score[g]);
  const ties = [];
  for (let g = 1; g <= N_GROUPS; g++) if (score[g] === best) ties.push(g);
  const group = ties[Math.floor(Math.random() * ties.length)];
  appendRows_(asg, [{ time: new Date().toISOString(), pid: pid, group: group }]);
  return { ok: true, group: group };
}

/* ---------------- helpers ---------------- */

function isSaved_(sid) {
  if (!sid) return false;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return readTable_(sheet_(ss, "participants")).some((r) => String(r.submission_id) === sid);
}

function saveRawFile_(ss, filename, content) {
  const props = PropertiesService.getScriptProperties();
  let folder = null;
  const id = props.getProperty("FOLDER_ID");
  if (id) {
    try {
      folder = DriveApp.getFolderById(id);
    } catch (err) {
      folder = null;
    }
  }
  if (!folder) {
    const parents = DriveApp.getFileById(ss.getId()).getParents();
    const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
    folder = parent.createFolder(FOLDER_NAME);
    props.setProperty("FOLDER_ID", folder.getId());
  }
  let name = filename.replace(/[^A-Za-z0-9_.-]/g, "_");
  if (folder.getFilesByName(name).hasNext()) name = name.replace(/\.json$/, "") + "_" + Date.now() + ".json";
  return folder.createFile(name, content, "application/json").getId();
}

function sheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function readTable_(sh) {
  const nr = sh.getLastRow();
  const nc = sh.getLastColumn();
  if (nr < 2 || nc < 1) return [];
  const vals = sh.getRange(1, 1, nr, nc).getValues();
  const head = vals[0];
  return vals.slice(1).map((row) => {
    const o = {};
    head.forEach((h, i) => (o[h] = row[i]));
    return o;
  });
}

/** Append objects as rows; new keys become new columns. */
function appendRows_(sh, rows) {
  if (!rows.length) return;
  const nc = sh.getLastColumn();
  const head = nc > 0 ? sh.getRange(1, 1, 1, nc).getValues()[0].filter((h) => h !== "") : [];
  rows.forEach((r) => Object.keys(r).forEach((k) => head.indexOf(k) < 0 && head.push(k)));
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  if (sh.getFrozenRows() === 0) sh.setFrozenRows(1);
  const out = rows.map((r) => head.map((k) => cell_(r[k])));
  sh.getRange(sh.getLastRow() + 1, 1, out.length, head.length).setValues(out);
}

function cell_(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") v = JSON.stringify(v);
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return "'" + v; // never let typed text run as a formula
  return v;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run this once from the editor (select it, click Run) to grant permissions and create the tabs. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ["participants", "persons", "items_close", "assignments"].forEach((n) => sheet_(ss, n));
  saveRawFile_(ss, "_setup_check.json", "{}");
}
