/*
 * Unit tests for google-apps-script/Code.gs (no Google account needed).
 *   node tests/test_apps_script.js
 */
const assert = require("assert");
const { makeEnv } = require("./apps_script_mock");

const env = makeEnv();
const get = (p) => JSON.parse(env.doGet({ parameter: p }).text);
const post = (o) => JSON.parse(env.doPost({ postData: { contents: JSON.stringify(o) } }).text);
const table = (name) => {
  const d = env.__dump().sheets[name] || [];
  return d.slice(1).map((r) => Object.fromEntries(d[0].map((h, i) => [h, r[i] ?? ""])));
};

function fakeSession(pid, group, codes, extra = {}) {
  const persons = codes.map((c, i) => ({ pid, group, code: c, source: "listed", list_position: i + 1, closeness: 6 }));
  const trials = [
    { trial_role: "ng_main", items: codes.map((c, i) => ({ position: i + 1, code: c, rt_from_onset: 1000 * (i + 1) })) },
    { trial_role: "summary", debug: false, summary: { pid, group, recency: "high", reminder: "neutral", first_rt_close: 1000, ...extra }, persons },
  ];
  return { study_id: "who-comes-to-mind", submission_id: `${pid}_1`, pid, filename: `who-comes-to-mind_${pid}.json`, data: JSON.stringify(trials) };
}

// 1. running check
assert.ok(get({}).ok);
env.setup();
assert.deepStrictEqual(Object.keys(env.__dump().sheets).sort(), ["assignments", "items_close", "participants", "persons"]);

// 2. balanced assignment: 8 people starting together -> exactly 2 per group
const groups = [];
for (let i = 0; i < 8; i++) groups.push(get({ action: "condition", pid: "p" + i }).group);
[1, 2, 3, 4].forEach((g) => assert.strictEqual(groups.filter((x) => x === g).length, 2, `group ${g}: ${groups}`));

// 3. a save adds rows to all three tabs and one raw file
assert.ok(post(fakeSession("p0", groups[0], ["chai-friend", "amma"])).ok);
assert.strictEqual(table("participants").length, 1);
assert.strictEqual(table("persons").length, 2);
assert.strictEqual(table("items_close").length, 2);
assert.ok(get({ action: "check", sid: "p0_1" }).saved);
assert.ok(!get({ action: "check", sid: "nope_1" }).saved);

// 4. a retry of the same session is not stored twice
assert.ok(post(fakeSession("p0", groups[0], ["chai-friend", "amma"])).duplicate);
assert.strictEqual(table("participants").length, 1);

// 5. text that looks like a formula is stored as text; a new field becomes a new column
assert.ok(post(fakeSession("p1", groups[1], ["=HYPERLINK(1)", "+gym"], { new_field: 5 })).ok);
const codes = table("persons").map((r) => r.code);
assert.ok(codes.includes("'=HYPERLINK(1)") && codes.includes("'+gym"), codes);
assert.strictEqual(table("participants")[1].new_field, 5);
assert.strictEqual(table("participants")[0].new_field, "");

// 6. completed sessions keep counting toward balance after the 45-minute window
const before = table("assignments").length;
const g9 = get({ action: "condition", pid: "p9" }).group;
assert.strictEqual(table("assignments").length, before + 1);
assert.ok(g9 >= 1 && g9 <= 4);

// 7. bad input is refused, not stored
assert.ok(!post({ study_id: "other", submission_id: "x_1", data: "[]" }).ok);
assert.ok(!post({ study_id: "who-comes-to-mind", submission_id: "x_1", data: "[]" }).ok); // no summary
assert.ok(!JSON.parse(env.doPost({ postData: { contents: "not json" } }).text).ok);

// 8. raw files land in one folder next to the Sheet
const files = env.__dump().files;
assert.strictEqual(files.filter((f) => f.folder === "who-comes-to-mind raw data").length, files.length);
assert.ok(files.some((f) => f.name === "who-comes-to-mind_p0.json"));

console.log("Code.gs tests: all passed");
