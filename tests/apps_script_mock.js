/*
 * Runs google-apps-script/Code.gs in Node with a fake Google Sheet + Drive,
 * as a small web server standing in for the deployed Web app.
 *
 *   node tests/apps_script_mock.js 8790
 *
 *   GET  /exec?...      -> doGet
 *   POST /exec          -> doPost
 *   GET  /__dump        -> the fake spreadsheet and Drive folder, as JSON (for tests)
 *
 * Note: the real Web app answers through a redirect to script.googleusercontent.com;
 * this mock answers directly.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const vm = require("vm");

function makeEnv() {
  const sheets = {};
  const files = {};
  let nextId = 1;
  const props = {};

  class Range {
    constructor(sh, r, c, nr, nc) {
      Object.assign(this, { sh, r, c, nr, nc });
    }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = [];
        for (let j = 0; j < this.nc; j++) row.push(((this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j]) ?? "");
        out.push(row);
      }
      return out;
    }
    setValues(v) {
      if (v.length !== this.nr || v.some((row) => row.length !== this.nc)) throw new Error("setValues: size mismatch");
      v.forEach((row, i) => {
        const R = this.r - 1 + i;
        this.sh.data[R] = this.sh.data[R] || [];
        row.forEach((x, j) => (this.sh.data[R][this.c - 1 + j] = x));
      });
    }
  }
  class Sheet {
    constructor(name) {
      this.name = name;
      this.data = [];
      this.frozen = 0;
    }
    getLastRow() {
      return this.data.length;
    }
    getLastColumn() {
      return this.data.reduce((m, r) => Math.max(m, r.length), 0);
    }
    getRange(r, c, nr, nc) {
      if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error("bad range");
      return new Range(this, r, c, nr, nc);
    }
    getFrozenRows() {
      return this.frozen;
    }
    setFrozenRows(n) {
      this.frozen = n;
    }
  }
  const iter = (arr) => {
    let i = 0;
    return { hasNext: () => i < arr.length, next: () => arr[i++] };
  };
  const makeFolder = (name) => {
    const id = "folder" + nextId++;
    const f = {
      id,
      name,
      getId: () => id,
      createFolder: (n) => makeFolder(n),
      getFilesByName: (n) => iter(Object.values(files).filter((x) => x.folder === id && x.name === n)),
      createFile: (n, content, mime) => {
        const fid = "file" + nextId++;
        files[fid] = { name: n, content, mime, folder: id };
        return { getId: () => fid };
      },
    };
    folders[id] = f;
    return f;
  };
  const folders = {};
  const parent = makeFolder("My Drive/Lab");

  const env = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getId: () => "SHEET",
        getSheetByName: (n) => sheets[n] || null,
        insertSheet: (n) => (sheets[n] = new Sheet(n)),
      }),
    },
    DriveApp: {
      getFileById: () => ({ getParents: () => iter([parent]) }),
      getFolderById: (id) => {
        if (!folders[id]) throw new Error("no folder");
        return folders[id];
      },
      getRootFolder: () => parent,
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => (props[k] = v) }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }),
    },
    console,
    Date,
    Math,
    JSON,
  };
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "google-apps-script", "Code.gs"), "utf8"), env);
  env.__dump = () => ({
    sheets: Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, v.data])),
    files: Object.values(files).map((f) => ({ name: f.name, folder: folders[f.folder].name, size: f.content.length })),
    folderNames: Object.values(folders).map((f) => f.name),
  });
  return env;
}

module.exports = { makeEnv };

if (require.main === module) {
  const port = Number(process.argv[2] || 8790);
  const env = makeEnv();
  http
    .createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      const send = (obj) => {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
      };
      if (u.pathname === "/__dump") return send(env.__dump());
      if (req.method === "GET") return send(env.doGet({ parameter: Object.fromEntries(u.searchParams) }).text);
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => send(env.doPost({ postData: { contents: body } }).text));
    })
    .listen(port, () => console.log("mock Apps Script on", port));
}
