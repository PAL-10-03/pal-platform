const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const os = require("os");
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "pal.json");
const secret = process.env.PAL_SESSION_SECRET || "pal-prototype-session-secret-change-me";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = crypto.scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  return next.length === prev.length && crypto.timingSafeEqual(next, prev);
}

function seed() {
  const now = new Date().toISOString();
  return {
    tenants: [
      { id: "tenant_born_again_air", legalName: "Born Again Air", displayName: "Born Again Air", slug: "born-again-air", status: "active", createdAt: now },
      { id: "tenant_northwind", legalName: "Northwind Test Company", displayName: "Northwind Test Company", slug: "northwind", status: "active", createdAt: now }
    ],
    users: [
      { id: "user_admin", email: "admin@pal.local", name: "PAL Admin", passwordHash: hashPassword("pal-admin"), isPalAdmin: true, status: "active" },
      { id: "user_baa_manager", email: "manager@bornagainair.local", name: "BAA Manager", passwordHash: hashPassword("manager"), isPalAdmin: false, status: "active" },
      { id: "user_baa_employee", email: "employee@bornagainair.local", name: "BAA Employee", passwordHash: hashPassword("employee"), isPalAdmin: false, status: "active" },
      { id: "user_northwind", email: "manager@northwind.local", name: "Northwind Manager", passwordHash: hashPassword("manager"), isPalAdmin: false, status: "active" }
    ],
    memberships: [
      { tenantId: "tenant_born_again_air", userId: "user_baa_manager", role: "manager" },
      { tenantId: "tenant_born_again_air", userId: "user_baa_employee", role: "employee" },
      { tenantId: "tenant_northwind", userId: "user_northwind", role: "manager" }
    ],
    modules: [
      { key: "core_processing", name: "Core Processing", description: "Identify and process used compressor cores." },
      { key: "workloads", name: "Workloads", description: "Open and finish workloads." },
      { key: "reports", name: "Reports", description: "Workload reports." },
      { key: "pricing", name: "Pricing", description: "Active customer price list." },
      { key: "approvals", name: "Approvals", description: "Review finished workloads." },
      { key: "invoice_processing", name: "Invoice Processing", description: "Process customer invoices." }
    ],
    tenantModules: [
      ["tenant_born_again_air", "core_processing", true],
      ["tenant_born_again_air", "workloads", true],
      ["tenant_born_again_air", "reports", true],
      ["tenant_born_again_air", "pricing", true],
      ["tenant_born_again_air", "approvals", false],
      ["tenant_born_again_air", "invoice_processing", false],
      ["tenant_northwind", "invoice_processing", true],
      ["tenant_northwind", "reports", true],
      ["tenant_northwind", "core_processing", false],
      ["tenant_northwind", "workloads", false],
      ["tenant_northwind", "pricing", false],
      ["tenant_northwind", "approvals", false]
    ].map(([tenantId, moduleKey, enabled]) => ({ tenantId, moduleKey, enabled })),
    audit: [],
    workloads: [],
    scans: [],
    files: []
  };
}

function load() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    const initial = seed();
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  db.workloads = db.workloads || [];
  db.scans = db.scans || [];
  db.files = db.files || [];
  db.users = db.users || [];
  let owner = db.users.find((user) => user.email === "kevin@pal.local");
  if (!owner) {
    owner = { id: "user_kevin", email: "kevin@pal.local", name: "Kevin", isPalAdmin: true, status: "active" };
    db.users.push(owner);
  }
  owner.passwordHash = hashPassword("pal-owner");
  owner.isPalAdmin = true;
  owner.status = "active";
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return db;
}

function save(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function readSession(req) {
  const header = req.headers.cookie || "";
  const raw = header.split(";").map((p) => p.trim()).find((p) => p.startsWith("pal_session="));
  if (!raw) return null;
  const token = decodeURIComponent(raw.slice("pal_session=".length));
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const session = JSON.parse(Buffer.from(body, "base64url").toString());
  if (session.exp < Date.now()) return null;
  return session;
}

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>
    :root { --ink:#1c1915; --muted:#6d645b; --line:#d9cbb6; --paper:#e7d7bc; --card:#fffaf3; --brand:#1f4d3a; }
    body { margin:0; font-family: Georgia, Palatino, serif; color:var(--ink); background:var(--paper); }
    main { max-width:880px; margin:0 auto; padding:28px 18px 64px; }
    .mark { letter-spacing:.16em; text-transform:uppercase; color:var(--brand); font-size:13px; margin:0; }
    .brand { display:flex; align-items:center; gap:12px; }
    .brand form { margin:0 0 0 auto; }
    .logo { width:42px; height:42px; display:block; }
    h1 { font-size:32px; margin:6px 0; }
    .sub, .meta { color:var(--muted); }
    .top { display:flex; justify-content:space-between; gap:16px; align-items:center; border-bottom:1px solid var(--line); padding-bottom:16px; }
    .grid { display:grid; gap:12px; } @media(min-width:700px){ .grid { grid-template-columns:1fr 1fr; } }
    .card, a.card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; color:inherit; text-decoration:none; display:block; }
    form { display:grid; gap:12px; margin-top:18px; }
    label { display:grid; gap:6px; color:var(--muted); font-size:14px; }
    input { border:1px solid var(--line); border-radius:10px; padding:12px 14px; font:inherit; }
    button, .button { border:0; background:var(--brand); color:white; border-radius:10px; padding:12px 14px; text-decoration:none; display:inline-block; }
    .actions { display:flex; gap:8px; align-items:center; } .actions form { margin:0; }
    .corner { display:flex; gap:8px; align-items:center; } .corner form { margin:0; }
    .ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
    .error { background:#f8e8e2; color:#8a3418; padding:10px 12px; border-radius:10px; }
    table { width:100%; border-collapse:collapse; } th, td { text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); }
    img { width:auto; max-width:100%; height:auto; object-fit:contain; border-radius:10px; display:block; } figcaption { margin-top:8px; font-weight:700; }
  </style></head><body><main>${body}</main></body></html>`;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(new URLSearchParams(data)));
  });
}

function brand() {
  return `<div class="brand"><svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#1f4d3a"/><text x="32" y="38" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#f6f3ee" letter-spacing="1">PAL</text><rect x="16" y="46" width="32" height="3" rx="1.5" fill="#c46a2d"/></svg><div><p class="mark">PAL Business Solutions</p></div></div>`;
}

function referenceData() {
  const dir = path.join(__dirname, "reference");
  return {
    baa: JSON.parse(fs.readFileSync(path.join(dir, "born-again-air.json"), "utf8")),
    fsPages: JSON.parse(fs.readFileSync(path.join(dir, "four-season-pages.json"), "utf8"))
  };
}

function bornAgainOnly(session) {
  return session && session.tenantId === "tenant_born_again_air";
}

function qtyRows(db, workloadId) {
  const rows = {};
  db.scans.filter((scan) => scan.workloadId === workloadId).forEach((scan) => {
    const key = scan.confirmedPartNumber;
    if (!rows[key]) rows[key] = { partNumber: key, qty: 0 };
    rows[key].qty += 1;
  });
  return Object.values(rows);
}

function workloadPage(session, db, workload) {
  const ref = bornAgainOnly(session) ? referenceData() : null;
  const rows = qtyRows(db, workload.id).map((row) => {
    const hit = ref && ref.baa.find((item) => item.reman === row.partNumber || item.raw.includes(row.partNumber));
    const image = ref && ref.fsPages[row.partNumber] ? `<a href="/reference/four-season/${row.partNumber}">Database image</a>` : "";
    const note = hit ? "In Born Again Air Database" : "Not in the loaded database";
    const label = db.scans.filter((item) => item.workloadId === workload.id && item.confirmedPartNumber === row.partNumber)
      .map((scan) => `<a href="/labels/${scan.id}">Print label</a>`).join("<br>");
    return `<tr><td>${row.partNumber}</td><td>${row.qty}</td><td>${label}</td><td><form method="post" action="/workloads/${workload.id}/qty"><input type="hidden" name="partNumber" value="${row.partNumber}"><input type="hidden" name="change" value="-1"><button type="submit">−</button></form> <form method="post" action="/workloads/${workload.id}/qty"><input type="hidden" name="partNumber" value="${row.partNumber}"><input type="hidden" name="change" value="1"><button type="submit">+</button></form></td></tr>`;
  }).join("");
  return page(workload.name, `
    ${header(session)}<h1>${workload.name}</h1>
    ${workload.status === "complete" ? `<p><strong>Box complete.</strong> Quantities can still be edited.</p>` : ""}
    <p class="sub">${workload.status}</p>
    <div class="card" style="margin-top:18px">
      <div id="match"></div>
      <form method="post" action="/workloads/${workload.id}/confirm">
        <label>Change part #<input name="partNumber" placeholder="Type the part number"></label>
        <button type="submit">Change part #</button>
      </form>
      <form id="scan-form">
        <div id="photos"></div>
        <button type="button" id="take-photo">Take photo</button>
        <button type="submit">Check databases</button>
        <p class="meta">Tap Take photo for each picture. One, five, or more. They are deleted after the check.</p>
        <p class="meta" id="scan-status"></p>
      </form>
      <div id="match"></div>
    </div>
    <div class="card" style="margin-top:12px">
      <table><tr><th>Core / Part #</th><th>QTY</th><th>Label</th><th></th></tr>${rows || `<tr><td colspan="4">No cores yet.</td></tr>`}</table>
    </div>
    <p style="margin-top:18px">${workload.status === "complete" && session.role === "manager" ? `<a class="button" href="/workloads/${workload.id}/ticket">Make P.O. ticket</a> <a class="button" href="/workloads/${workload.id}/report">Excel report</a>` : workload.status === "complete" ? `<p>Box complete. Quantities can still be edited.</p>` : `<form method="post" action="/workloads/${workload.id}/finish"><button type="submit">Finish box</button></form>`} <a class="button ghost" href="/modules/workloads">Back to workloads</a></p>
    <script>
      async function fileToBase64(file) {
        const image = await createImageBitmap(file);
        const scale = Math.min(1, 800 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      }
      document.getElementById("take-photo").addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.capture = "environment";
        input.addEventListener("change", () => {
          if (!input.files[0]) return;
          const label = document.createElement("label");
          label.textContent = "Photo " + (document.querySelectorAll("#photos input").length + 1);
          label.appendChild(input);
          document.getElementById("photos").appendChild(label);
        });
        input.click();
      });
      document.getElementById("scan-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const status = document.getElementById("scan-status");
        const match = document.getElementById("match");
        const files = [...document.querySelectorAll("#photos input")].map((input) => input.files[0]).filter(Boolean);
        if (!files.length) { status.textContent = "Add at least one photo."; return; }
        status.textContent = "Checking the databases...";
        try {
          const body = new URLSearchParams();
          for (const file of files) body.append("photo", await fileToBase64(file));
          const response = await fetch("/workloads/${workload.id}/scans", { method: "POST", body });
          const result = await response.json();
          const change = '<form method="post" action="/workloads/${workload.id}/confirm"><label>Change part #<input name="partNumber" required></label><button type="submit">Change part #</button></form>';
          const confirm = '<form method="post" action="/workloads/${workload.id}/confirm"><input type="hidden" name="partNumber" value="' + (result.partNumber || "") + '"><button type="submit">Confirm</button></form>';
          const image = result.file ? '<img src="/reference/square/' + result.file + '" alt="Database square">' : "";
          const choices = (result.choices || []).map((choice) => {
            const image = choice.file ? '<img src="/reference/square/' + choice.file + '" alt="Database square">' : "";
            return '<div class="card"><p>Part number: <strong>' + choice.partNumber + '</strong></p><p>Core number: <strong>' + (choice.coreNumber || "Not in Born Again Air Database") + '</strong></p>' + image +
              '<form method="post" action="/workloads/${workload.id}/confirm"><input type="hidden" name="partNumber" value="' + choice.partNumber + '"><button type="submit">Use this square</button></form></div>';
          }).join("");
          match.innerHTML = result.partNumber
            ? "<p>Part number: <strong>" + result.partNumber + "</strong></p><p>Core number: <strong>" + (result.coreNumber || "Not in Born Again Air Database") + "</strong></p>" + image + confirm + change
            : "<p>No exact match. Pick the closest catalog square.</p>" + choices + change;
          status.textContent = "Photos deleted. The result is above.";
        } catch (error) {
          status.textContent = "The check did not finish. Try the photos again.";
        }
      });
    </script>`);
}

function excelReport(workload, lines) {
  const safeLines = lines.length ? lines : [{ partNumber: "", coreNumber: "", qty: 0, price: 0 }];
  const esc = (value) => String(value).replace(/&/g, "&").replace(/</g, "<");
  const last = safeLines.length + 1;
  const rows = [
    ["Part #", "Core #", "QTY", "Price", "Total"],
    ...safeLines.map((line) => [line.partNumber, line.coreNumber, line.qty, line.price, null]),
    ["", "Total units", null, "", ""],
    ["", "", "", "Box total", null]
  ];
  const sheet = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`];
  rows.forEach((row, index) => {
    const r = index + 1;
    const cols = row.map((value, col) => {
      const ref = String.fromCharCode(65 + col) + r;
      if (r > 1 && r <= last && col === 4) return `<c r="${ref}"><f>C${r}*D${r}</f></c>`;
      if (r === last + 1 && col === 2) return `<c r="${ref}"><f>SUM(C2:C${last})</f></c>`;
      if (r === last + 2 && col === 4) return `<c r="${ref}"><f>SUM(E2:E${last})</f></c>`;
      if (value == null || value === "") return "";
      if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
    }).join("");
    sheet.push(`<row r="${r}">${cols}</row>`);
  });
  sheet.push(`</sheetData></worksheet>`);
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Box report" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": sheet.join("")
  };
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const parts = [];
  const central = [];
  let offset = 0;
  Object.entries(files).forEach(([name, text]) => {
    const fileName = Buffer.from(name);
    const data = Buffer.from(text);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    parts.push(local, fileName, data);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(fileName.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(head, fileName);
    offset += local.length + fileName.length + data.length;
  });
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

function header(session) {
  return `<div class="top"><div>${brand()}<p class="sub">${session.tenantName} · ${session.role}</p></div><div class="corner"><a class="button ghost" href="/dashboard">Home</a><a class="button ghost" href="/password">Password</a><form method="post" action="/logout"><button class="ghost" type="submit">Sign out</button></form></div></div>`;
}

function loadReference() {
  const dir = path.join(__dirname, "reference");
  const born = JSON.parse(fs.readFileSync(path.join(dir, "born-again-air.json"), "utf8"));
  const pages = JSON.parse(fs.readFileSync(path.join(dir, "four-season-pages.json"), "utf8"));
  const numbers = new Map();
  born.forEach((row) => {
    const reman = String(row.reman || "").trim();
    if (reman) numbers.set(reman, { partNumber: reman, coreNumber: reman, source: "Born Again Air Database.pdf", raw: row.raw, page: pages[reman] || null });
    String(row.raw || "").split(/\s+/).forEach((token) => {
      if (/^\d{4,}$/.test(token) && !numbers.has(token)) numbers.set(token, { partNumber: token, coreNumber: reman || token, source: "Born Again Air Database.pdf", raw: row.raw, page: pages[token] || pages[reman] || null });
    });
  });
  Object.keys(pages).forEach((part) => {
    if (!numbers.has(part)) numbers.set(part, { partNumber: part, source: "4 Season Database.pdf", raw: "", page: pages[part] });
  });
  return { numbers, pages };
}

let referenceCache = null;
function reference() {
  if (!referenceCache) referenceCache = loadReference();
  return referenceCache;
}

function photoHash(filePath) {
  const jpeg = require("./jpeg");
  const decoded = jpeg.decode(fs.readFileSync(filePath), { useTArray: true });
  const size = 16;
  const pixels = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(decoded.width - 1, Math.floor(x * decoded.width / size));
      const sy = Math.min(decoded.height - 1, Math.floor(y * decoded.height / size));
      const i = (sy * decoded.width + sx) * 4;
      pixels.push(decoded.data[i] * 0.3 + decoded.data[i + 1] * 0.59 + decoded.data[i + 2] * 0.11);
    }
  }
  const avg = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  return pixels.map((value) => value > avg ? "1" : "0").join("");
}

function coreFrom(row) {
  if (!row) return "";
  if (row.partNumber) return String(row.partNumber);
  return (String(row.raw || "").match(/\b\d{6,8}\b/) || [""])[0];
}

function lookupNumber(numbers, token) {
  if (numbers.has(token)) return { row: numbers.get(token), score: token.length + 100 };
  let best = null;
  for (const [key, row] of numbers) {
    if (key.length < 5 || token.length < 5) continue;
    if (key.startsWith(token) || token.startsWith(key)) {
      const score = Math.min(key.length, token.length);
      if (!best || score > best.score) best = { row, score };
    }
  }
  return best;
}

async function readPhotoNumbers(filePath) {
  const found = new Set();
  const add = (text) => (String(text || "").match(/\d{4,}/g) || []).forEach((token) => found.add(token));
  try {
    add(require("child_process").execFileSync("tesseract", [filePath, "stdout", "--psm", "6"], { encoding: "utf8" }));
    add(require("child_process").execFileSync("tesseract", [filePath, "stdout", "--psm", "11"], { encoding: "utf8" }));
  } catch (error) {
    try {
      const { createWorker } = require("tesseract.js");
      const worker = await createWorker("eng");
      add((await worker.recognize(filePath)).data.text);
      await worker.terminate();
    } catch (inner) {
      // This photo had no readable number.
    }
  }
  return [...found];
}

async function askPictureCheck(filePaths, extra) {
  const key = process.env.XAI_API_KEY;
  if (!key) return "";
  const images = filePaths.slice(0, 7).map((filePath) => {
    const data = fs.readFileSync(filePath).toString("base64");
    return { type: "image_url", image_url: { url: "data:image/jpeg;base64," + data } };
  });
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({
      model: "grok-4",
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Read only numbers printed on the compressor label or stamp. Reply with the digits you can see, separated by spaces. If no number is readable, reply NONE. Do not guess. Do not use memory. " + (extra || "") },
          ...images
        ]
      }]
    })
  });
  if (!response.ok) return "";
  const payload = await response.json();
  return String(payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content || "");
}

async function matchPhotos(filePaths) {
  const { numbers } = reference();
  const aliases = new Map([["84177574", "168305"]]);
  const hits = [];
  try {
    const read = await askPictureCheck(filePaths);
    String(read).match(/\d{4,}/g)?.forEach((token) => {
      const mapped = aliases.get(token) || token;
      const hit = lookupNumber(numbers, mapped);
      if (hit) hits.push({ ...hit, token: mapped });
    });
  } catch (error) {
    // The key check can fail. The local number read still runs.
  }
  for (const filePath of filePaths) {
    const tokens = await readPhotoNumbers(filePath);
    tokens.forEach((token) => {
      const mapped = aliases.get(token) || token;
      const hit = lookupNumber(numbers, mapped);
      if (hit) hits.push({ ...hit, token: mapped });
    });
  }
  hits.sort((left, right) => right.score - left.score);
  const squares = JSON.parse(fs.readFileSync(path.join(__dirname, "reference", "square-hashes.json"), "utf8"));
  const numberMatch = hits[0] || null;
  if (numberMatch) {
    const square = squares.find((row) => row.partNumber === numberMatch.row.partNumber) || null;
    return {
      partNumber: numberMatch.row.partNumber,
      coreNumber: numberMatch.row.coreNumber || numberMatch.row.partNumber,
      file: square ? square.file : null,
      choices: [],
      source: "Born Again Air list"
    };
  }
  const clutchless = new Set();
  numbers.forEach((row) => {
    if (/clutchless|without clutch|no clutch/i.test(row.raw || "")) clutchless.add(row.partNumber);
  });
  const ranked = [];
  for (const filePath of filePaths) {
    let hash = "";
    try { hash = photoHash(filePath); } catch (error) { continue; }
    squares.forEach((row) => {
      if (!row.hash || !row.partNumber || clutchless.has(row.partNumber)) return;
      ranked.push({ distance: hamming(hash, row.hash), row });
    });
  }
  ranked.sort((left, right) => left.distance - right.distance);
  const close = [];
  const seen = new Set();
  for (const item of ranked) {
    if (seen.has(item.row.partNumber)) continue;
    const image = path.join(__dirname, "reference", "fs-parts", item.row.file || "");
    if (!fs.existsSync(image)) continue;
    seen.add(item.row.partNumber);
    close.push({ partNumber: item.row.partNumber, file: item.row.file, image });
    if (close.length === 4) break;
  }
  if (!close.length) return { partNumber: null, coreNumber: "", file: null, choices: [], source: "no match in the loaded databases" };
  try {
    const pick = await askPictureCheck(filePaths.concat(close.map((item) => item.image)), "The last images are catalog squares labeled " + close.map((item) => item.partNumber).join(", ") + ". If the compressor has a clutch, do not pick a square with no clutch. Reply with one part number from that list, or NONE.");
    const picked = close.find((item) => String(pick).includes(item.partNumber));
    if (picked && numbers.has(picked.partNumber)) {
      const known = numbers.get(picked.partNumber);
      return { partNumber: picked.partNumber, coreNumber: known.coreNumber || known.partNumber, file: picked.file, choices: [], source: "catalog square" };
    }
  } catch (error) {
    // No square was accepted.
  }
  return { partNumber: null, coreNumber: "", file: null, choices: [], source: "no match in the loaded databases" };
}

function hamming(left, right) {
  let score = 0;
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) if (left[i] !== right[i]) score += 1;
  return score;
}

function activePriceSheet(tenantId) {
  const tenantFile = path.join(dataDir, "files", tenantId, "price-sheet.json");
  const file = fs.existsSync(tenantFile) ? tenantFile : path.join(__dirname, "reference", "price-sheet.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parsePriceWorkbook(buffer) {
  const zlib = require("zlib");
  const files = {};
  let offset = 0;
  while (offset + 30 < buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compressed = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLen).toString();
    const start = offset + 30 + nameLen + extraLen;
    const raw = buffer.slice(start, start + compressed);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    offset = start + compressed;
  }
  const strings = [];
  const shared = files["xl/sharedStrings.xml"];
  if (shared) {
    String(shared).replace(/<si>[\s\S]*?<\/si>/g, (item) => {
      const text = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join("");
      strings.push(text);
      return item;
    });
  }
  const sheet = String(files["xl/worksheets/sheet1.xml"] || "");
  const rows = [];
  sheet.replace(/<row[\s\S]*?<\/row>/g, (row) => {
    const values = [];
    row.replace(/<c([^>]*)>([\s\S]*?)<\/c>/g, (cell, attrs, body) => {
      const ref = (attrs.match(/r="([A-Z]+)/) || [])[1] || "";
      const index = ref.split("").reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      const value = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || "";
      values[index] = attrs.includes('t="s"') ? strings[Number(value)] || "" : value;
      return cell;
    });
    const price = Number(values[5]);
    if (values[1] && Number.isFinite(price)) rows.push({ basePn: String(values[0] || ""), coreBase: String(values[1]), model: String(values[2] || ""), description: String(values[3] || ""), buyQty: String(values[4] || ""), price });
    return row;
  });
  return rows;
}

function roleCanOpen(role, moduleKey) {
  if (role === "manager") return true;
  return moduleKey === "core_processing" || moduleKey === "workloads";
}

function send(res, status, html, headers = {}) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = load();
  const session = readSession(req);

  if (url.pathname === "/" ) {
    res.writeHead(302, { location: session ? (session.isPalAdmin ? "/admin" : "/dashboard") : "/login" });
    res.end();
    return;
  }

  if (url.pathname === "/login" && req.method === "GET") {
    const error = url.searchParams.get("error") ? `<div class="error">Email or password did not match.</div>` : url.searchParams.get("changed") ? `<p>Password changed. Sign in with the new password.</p>` : "";
    send(res, 200, page("Sign in", `
      ${brand(false)}<h1>Sign in</h1>
      <p class="sub">Company workspace. Your account opens only the company you belong to.</p>
      <form class="card" method="post" action="/login">${error}
        <label>Email<input name="email" type="email" required></label>
        <label>Password<input id="password" name="password" type="password" required></label>
        <label><input id="show-password" type="checkbox"> Show password</label>
        <button type="submit">Sign in</button>
        <a class="button ghost" href="/password">Change password</a>
      </form>
      <script>
        document.getElementById("show-password").addEventListener("change", (event) => {
          document.getElementById("password").type = event.target.checked ? "text" : "password";
        });
      </script>
      <p class="meta">Prototype accounts. Change these before any real customer use.</p>
      <ul>
        <li>kevin@pal.local / pal-owner</li>
        <li>manager@bornagainair.local / manager</li>
        <li>employee@bornagainair.local / employee</li>
        <li>manager@northwind.local / manager</li>
      </ul>`));
    return;
  }

  if (url.pathname === "/login" && req.method === "POST") {
    const body = await parseBody(req);
    const email = String(body.get("email") || "").trim().toLowerCase();
    const password = String(body.get("password") || "");
    const user = db.users.find((item) => item.email === email && item.status === "active");
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.writeHead(302, { location: "/login?error=1" });
      res.end();
      return;
    }
    const membership = db.memberships.find((item) => item.userId === user.id);
    const tenant = membership && db.tenants.find((item) => item.id === membership.tenantId);
    db.audit.push({ at: new Date().toISOString(), action: "login", userId: user.id, tenantId: tenant ? tenant.id : null });
    save(db);
    const token = sign({
      userId: user.id, email: user.email, name: user.name, isPalAdmin: user.isPalAdmin,
      tenantId: tenant ? tenant.id : null, tenantName: tenant ? tenant.displayName : null,
      role: membership ? membership.role : null, exp: Date.now() + 12 * 60 * 60 * 1000
    });
    res.writeHead(302, {
      location: user.isPalAdmin ? "/admin" : "/dashboard",
      "set-cookie": `pal_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`
    });
    res.end();
    return;
  }

  if (url.pathname === "/logout") {
    res.writeHead(302, { location: "/login", "set-cookie": "pal_session=; HttpOnly; Path=/; Max-Age=0" });
    res.end();
    return;
  }

  if (url.pathname === "/password" && req.method === "GET" && !session) {
    send(res, 200, page("Change password", `
      ${brand(false)}<h1>Change password</h1>
      <form class="card" method="post" action="/password">
        <label>Username<input name="email" type="email" required></label>
        <label>Current password<input name="current" type="password" required></label>
        <label>New password<input id="next-password" name="next" type="password" required></label>
        <label><input id="show-password" type="checkbox"> Show password</label>
        <button type="submit">Change password</button>
      </form>
      <script>
        document.getElementById("show-password").addEventListener("change", (event) => {
          document.getElementById("next-password").type = event.target.checked ? "text" : "password";
        });
      </script>`));
    return;
  }

  if (url.pathname === "/password" && req.method === "POST" && !session) {
    const body = await parseBody(req);
    const email = String(body.get("email") || "").trim().toLowerCase();
    const user = db.users.find((item) => item.email === email && item.status === "active");
    if (!user || !verifyPassword(String(body.get("current") || ""), user.passwordHash)) {
      send(res, 200, page("Change password", `${brand(false)}<h1>Change password</h1><p>Username or current password did not match.</p><a class="button" href="/password">Try again</a>`));
      return;
    }
    user.passwordHash = hashPassword(String(body.get("next") || ""));
    save(db);
    res.writeHead(302, { location: "/login?changed=1" });
    res.end();
    return;
  }

  if (!session) {
    res.writeHead(302, { location: "/login" });
    res.end();
    return;
  }

  if (url.pathname === "/admin") {
    if (!session.isPalAdmin) {
      res.writeHead(302, { location: "/dashboard" });
      res.end();
      return;
    }
    const rows = db.tenants.map((tenant) => {
      const people = db.memberships.filter((item) => item.tenantId === tenant.id).map((item) => db.users.find((user) => user.id === item.userId)).filter(Boolean);
      return people.map((user) => `<tr><td>${tenant.displayName}</td><td><form method="post" action="/admin/reset"><input type="hidden" name="userId" value="${user.id}"><input name="email" value="${user.email}" required><input name="password" type="password" placeholder="New password, blank keeps current"><label><input type="checkbox" onchange="this.form.password.type=this.checked?'text':'password'"> Show password</label><button type="submit">Save</button></form></td></tr>`).join("");
    }).join("");
    send(res, 200, page("PAL Admin", `
      <div class="top"><div>${brand(false)}<h1>Master list</h1>
      <p class="sub">${session.name}. Change a company username or password here.</p></div>
      <form method="post" action="/logout"><button class="ghost" type="submit">Sign out</button></form></div>
      <div class="card" style="margin-top:18px"><table><tr><th>Company</th><th>Username and password</th></tr>${rows}</table></div>`));
    return;
  }

  if (url.pathname === "/password" && req.method === "GET") {
    const message = url.searchParams.get("saved") ? `<p>Password updated.</p>` : "";
    send(res, 200, page("Password", `
      ${header(session)}<h1>Password</h1>
      <p class="sub">Change the password for this sign-in. The username stays the same.</p>
      <form class="card" method="post" action="/password">${message}
        <label>Current password<input name="current" type="password" required></label>
        <label>New password<input name="next" type="password" required></label>
        <button type="submit">Update password</button>
      </form>`));
    return;
  }

  if (url.pathname === "/password" && req.method === "POST") {
    const body = await parseBody(req);
    const user = db.users.find((item) => item.id === session.userId);
    if (!user || !verifyPassword(String(body.get("current") || ""), user.passwordHash)) {
      send(res, 200, page("Password", `${header(session)}<h1>Password</h1><p>Current password did not match.</p><a class="button" href="/password">Try again</a>`));
      return;
    }
    user.passwordHash = hashPassword(String(body.get("next") || ""));
    save(db);
    res.writeHead(302, { location: "/password?saved=1" });
    res.end();
    return;
  }

  if (url.pathname === "/admin/reset" && req.method === "POST") {
    if (!session.isPalAdmin) {
      send(res, 403, "Not available");
      return;
    }
    const body = await parseBody(req);
    const user = db.users.find((item) => item.id === body.get("userId") && !item.isPalAdmin);
    const email = String(body.get("email") || "").trim().toLowerCase();
    const password = String(body.get("password") || "");
    if (user && email) user.email = email;
    if (user && password) user.passwordHash = hashPassword(password);
    save(db);
    res.writeHead(302, { location: "/admin" });
    res.end();
    return;
  }

  if (url.pathname === "/dashboard") {
    if (!session.tenantId) {
      res.writeHead(302, { location: "/admin" });
      res.end();
      return;
    }
    const cards = db.tenantModules.filter((item) => item.tenantId === session.tenantId && item.enabled && item.moduleKey !== "approvals" && roleCanOpen(session.role, item.moduleKey))
      .map((item) => db.modules.find((mod) => mod.key === item.moduleKey))
      .map((mod) => `<a class="card" href="/modules/${mod.key}"><strong>${mod.name}</strong><br><span class="meta">${mod.description}</span></a>`)
      .join("");
    send(res, 200, page(session.tenantName, `
      <div class="top"><div>${brand()}<h1>${session.tenantName}</h1>
      <p class="sub">${session.name} · ${session.role}</p></div>
      <div class="corner"><a class="button ghost" href="/dashboard">Home</a><a class="button ghost" href="/password">Password</a><form method="post" action="/logout"><button class="ghost" type="submit">Sign out</button></form></div></div>
      <div class="grid" style="margin-top:18px">${cards}</div>`));
    return;
  }

  if (url.pathname === "/modules/core_processing") {
    if (!session.tenantId || !roleCanOpen(session.role, "core_processing")) {
      send(res, 404, page("Not available", `<h1>Not available</h1><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    send(res, 200, page("Core Processing", `
      ${header(session)}<h1>Core Processing</h1>
      <p class="sub">One compressor check. Nothing is saved.</p>
      <div class="card" style="margin-top:18px">
        <div id="match"></div>
        <form id="part-form">
          <label>Part number<input id="part-number" placeholder="Type the part number"></label>
          <button type="submit">Look up part number</button>
        </form>
        <form id="check-form">
          <div id="photos"></div>
          <button type="button" id="take-photo">Take photo</button>
          <button type="submit">Check databases</button>
          <p class="meta" id="scan-status"></p>
        </form>
      </div>
      <script>
        async function fileToBase64(file) {
          const image = await createImageBitmap(file);
          const scale = Math.min(1, 800 / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
          return btoa(binary);
        }
        document.getElementById("part-form").addEventListener("submit", async (event) => {
          event.preventDefault();
          const partNumber = document.getElementById("part-number").value.trim();
          if (!partNumber) return;
          const response = await fetch("/check-part", { method: "POST", body: new URLSearchParams({ partNumber }) });
          const result = await response.json();
          document.getElementById("match").innerHTML = "<p>Part number: <strong>" + partNumber + "</strong></p><p>Core number: <strong>" + (result.coreNumber || "Not in Born Again Air Database") + "</strong></p><p class=\"meta\">Nothing was saved.</p>";
        });
        document.getElementById("take-photo").addEventListener("click", () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.capture = "environment";
          input.addEventListener("change", () => {
            if (!input.files[0]) return;
            const label = document.createElement("label");
            label.textContent = "Photo " + (document.querySelectorAll("#photos input").length + 1);
            label.appendChild(input);
            document.getElementById("photos").appendChild(label);
          });
          input.click();
        });
        document.getElementById("check-form").addEventListener("submit", async (event) => {
          event.preventDefault();
          const status = document.getElementById("scan-status");
          status.textContent = "Checking the databases...";
          const files = [...document.querySelectorAll("#photos input")].map((input) => input.files[0]).filter(Boolean);
          if (!files.length) { status.textContent = "Add at least one photo."; return; }
          const body = new URLSearchParams();
          for (const file of files) body.append("photo", await fileToBase64(file));
          const response = await fetch("/check", { method: "POST", body });
          const result = await response.json();
          const image = result.file ? '<img src="/reference/square/' + result.file + '" alt="Database square">' : "";
          document.getElementById("match").innerHTML = result.partNumber
            ? "<p>Part number: <strong>" + result.partNumber + "</strong></p><p>Core number: <strong>" + (result.coreNumber || "Not in Born Again Air Database") + "</strong></p>" + image
            : "<p>No match in the loaded databases. Nothing was saved.</p>";
          status.textContent = "Photos deleted. Nothing was saved.";
        });
      </script>`));
    return;
  }

  if (url.pathname === "/check-part" && req.method === "POST") {
    if (!session.tenantId || !roleCanOpen(session.role, "core_processing")) {
      send(res, 403, "Not available");
      return;
    }
    const body = await parseBody(req);
    const partNumber = String(body.get("partNumber") || "").trim();
    const known = reference().numbers.get(partNumber);
    send(res, 200, JSON.stringify({ partNumber, coreNumber: known ? (known.coreNumber || "") : "" }), { "content-type": "application/json" });
    return;
  }

  if (url.pathname === "/modules/workloads") {
    if (!session.tenantId || !roleCanOpen(session.role, "workloads")) {
      send(res, 404, page("Not available", `<h1>Not available</h1><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    const workloads = db.workloads.filter((item) => item.tenantId === session.tenantId);
    const open = workloads.filter((item) => item.status !== "complete" && item.status !== "archived");
    const done = workloads.filter((item) => item.status === "complete");
    const list = open.map((item) => `<a class="card" href="/workloads/${item.id}"><strong>${item.name}</strong><br><span class="meta">${item.status} · ${db.scans.filter((scan) => scan.workloadId === item.id).length} cores</span></a>`).join("");
    const complete = done.map((item) => {
      const qty = db.scans.filter((scan) => scan.workloadId === item.id).length;
      const managerLinks = session.role === "manager" ? `<p style="margin-top:8px"><a href="/workloads/${item.id}/ticket">P.O. ticket</a> · <a href="/workloads/${item.id}/report">Excel</a></p>` : `<p class="meta">${qty} cores</p>`;
      return `<div class="card"><a href="/workloads/${item.id}"><strong>${item.poNumber || item.name}</strong><br><span class="meta">${item.name} · complete</span></a>${managerLinks}${session.role === "manager" ? `<form method="post" action="/workloads/${item.id}/delete"><button class="ghost" type="submit">Trash</button></form>` : ""}</div>`;
    }).join("");
    send(res, 200, page("Workloads", `
      ${header(session)}<h1>Workloads</h1>
      <p class="sub">${session.tenantName}. Boxes and quantities are tracked here.</p>
      <form class="card" method="post" action="/workloads">
        <label>Workload name<input name="name" required placeholder="10/5 Box 1"></label>
        <button type="submit">Start workload</button>
      </form>
      <div class="grid" style="margin-top:12px">${list || `<p class="meta">No open boxes.</p>`}</div>
      <h2 style="margin-top:24px">Complete boxes</h2>
      <div class="grid" style="margin-top:12px">${complete || `<p class="meta">No complete boxes.</p>`}</div>`));
    return;
  }

  if (url.pathname === "/check" && req.method === "POST") {
    if (!session.tenantId || !roleCanOpen(session.role, "core_processing")) {
      send(res, 403, "Not available");
      return;
    }
    const body = await parseBody(req);
    const photos = body.getAll("photo").filter(Boolean);
    if (!photos.length || session.tenantId !== "tenant_born_again_air") {
      send(res, 200, JSON.stringify({ partNumber: null }), { "content-type": "application/json" });
      return;
    }
    const dir = path.join(dataDir, "files", session.tenantId);
    fs.mkdirSync(dir, { recursive: true });
    const filePaths = photos.map((photo) => {
      const filePath = path.join(dir, crypto.randomUUID());
      fs.writeFileSync(filePath, Buffer.from(photo, "base64"));
      return filePath;
    });
    let match = null;
    try { match = await matchPhotos(filePaths); } catch (error) { match = null; }
    filePaths.forEach((filePath) => fs.unlinkSync(filePath));
    send(res, 200, JSON.stringify(match || { partNumber: null }), { "content-type": "application/json" });
    return;
  }

  if (url.pathname === "/modules/core_processing" || url.pathname === "/modules/workloads") {
    if (!session.tenantId || !roleCanOpen(session.role, "core_processing")) {
      send(res, 404, page("Not available", `<h1>Not available</h1><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    const workloads = db.workloads.filter((item) => item.tenantId === session.tenantId);
    const list = workloads.map((item) => `<a class="card" href="/workloads/${item.id}"><strong>${item.name}</strong><br><span class="meta">${item.status} · ${db.scans.filter((scan) => scan.workloadId === item.id).length} cores</span></a>`).join("");
    send(res, 200, page("Core Processing", `
      ${header(session)}<h1>Core Processing</h1>
      <p class="sub">${session.tenantName}. One compressor at a time.</p>
      <form class="card" method="post" action="/workloads">
        <label>Workload name<input name="name" required placeholder="10/5 Box 1"></label>
        <button type="submit">Start workload</button>
      </form>
      <div class="grid" style="margin-top:12px">${list || `<p class="meta">No workloads yet.</p>`}</div>`));
    return;
  }

  if (url.pathname === "/workloads" && req.method === "POST") {
    if (!session.tenantId || !roleCanOpen(session.role, "core_processing")) {
      send(res, 403, "Not available");
      return;
    }
    const body = await parseBody(req);
    const name = String(body.get("name") || "").trim();
    if (!name) {
      res.writeHead(302, { location: "/modules/core_processing" });
      res.end();
      return;
    }
    const id = crypto.randomUUID();
    db.workloads.push({ id, tenantId: session.tenantId, name, status: "open", startedBy: session.userId, startedAt: new Date().toISOString() });
    save(db);
    res.writeHead(302, { location: `/workloads/${id}` });
    res.end();
    return;
  }

  const workloadMatch = url.pathname.match(/^\/workloads\/([^/]+)$/);
  if (workloadMatch) {
    const workload = db.workloads.find((item) => item.id === workloadMatch[1] && item.tenantId === session.tenantId);
    if (!workload || !roleCanOpen(session.role, "core_processing")) {
      send(res, 404, page("Not available", `<h1>Not available</h1><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    send(res, 200, workloadPage(session, db, workload));
    return;
  }

  const labelMatch = url.pathname.match(/^\/labels\/([^/]+)$/);
  if (labelMatch) {
    const scan = db.scans.find((item) => item.id === labelMatch[1] && item.tenantId === session.tenantId);
    if (!scan || !roleCanOpen(session.role, "workloads")) {
      send(res, 404, page("Not available", `<h1>Not available</h1><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    const link = `${url.origin}/labels/${scan.id}`;
    const squares = JSON.parse(fs.readFileSync(path.join(__dirname, "reference", "fs-squares.json"), "utf8"));
    const square = squares.find((item) => item.partNumber === scan.confirmedPartNumber);
    const image = square ? `<img src="/reference/square/${square.file}" alt="Catalog square">` : "";
    const ask = url.searchParams.get("ask") ? `<script>if (confirm("Print barcode?")) window.print();</script>` : "";
    send(res, 200, page("Label", `
      ${header(session)}<h1>Core label</h1>
      <div class="card" style="max-width:420px">
        <p>Part number: <strong>${scan.confirmedPartNumber || ""}</strong></p>
        <p>Core number: <strong>${scan.coreNumber || ""}</strong></p>
        ${image}
        <img alt="QR code" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}">
        <p class="meta">Scan opens this square, part number, and core number.</p>
      </div>
      <p style="margin-top:18px"><button type="button" onclick="window.print()">Print</button> <a class="button ghost" href="/workloads/${scan.workloadId}">Back to box</a></p>
      ${ask}`));
    return;
  }

  const reportMatch = url.pathname.match(/^\/workloads\/([^/]+)\/report$/);
  if (reportMatch) {
    const workload = db.workloads.find((item) => item.id === reportMatch[1] && item.tenantId === session.tenantId);
    if (!workload || session.role !== "manager") {
      send(res, 404, page("Not available", `<h1>Not available</h1><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    const prices = activePriceSheet(session.tenantId);
    const lines = qtyRows(db, workload.id).map((row) => {
      const scan = db.scans.find((item) => item.workloadId === workload.id && item.confirmedPartNumber === row.partNumber);
      const priceRow = prices.find((item) => item.coreBase === row.partNumber || item.basePn === row.partNumber);
      return { partNumber: row.partNumber, coreNumber: scan && scan.coreNumber ? scan.coreNumber : "", qty: row.qty, price: priceRow ? Number(priceRow.price) : "" };
    });
    const file = excelReport(workload, lines);
    res.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${workload.name.replace(/[^a-zA-Z0-9._-]/g, "") || "box"}-report.xlsx"`
    });
    res.end(file);
    return;
  }

  const ticketMatch = url.pathname.match(/^\/workloads\/([^/]+)\/ticket$/);
  if (ticketMatch) {
    const workload = db.workloads.find((item) => item.id === ticketMatch[1] && item.tenantId === session.tenantId);
    if (!workload || session.role !== "manager") {
      send(res, 404, page("Not available", `<h1>Not available</h1><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    const prices = activePriceSheet(session.tenantId);
    if (!workload.poNumber) {
      const used = db.workloads.filter((item) => item.tenantId === session.tenantId && item.poNumber).map((item) => Number(String(item.poNumber).replace("PO-", "")));
      const next = (used.length ? Math.max(...used) : 0) + 1;
      workload.poNumber = `PO-${String(next).padStart(3, "0")}`;
      save(db);
    }
    const po = workload.poNumber;
    let units = 0;
    let boxTotal = 0;
    const rows = qtyRows(db, workload.id).map((row) => {
      const scan = db.scans.find((item) => item.workloadId === workload.id && item.confirmedPartNumber === row.partNumber);
      const priceRow = prices.find((item) => item.coreBase === row.partNumber || item.basePn === row.partNumber);
      const price = priceRow ? Number(priceRow.price) : null;
      const line = price == null ? 0 : price * row.qty;
      units += row.qty;
      boxTotal += line;
      return `<tr><td>${row.partNumber}</td><td>${scan && scan.coreNumber ? scan.coreNumber : ""}</td><td>${row.qty}</td><td>${price == null ? "Not on price sheet" : "$" + price.toFixed(2)}</td><td>${price == null ? "" : "$" + line.toFixed(2)}</td></tr>`;
    }).join("");
    send(res, 200, page(po, `
      ${header(session)}<h1>${po}</h1>
      <p class="sub">${workload.name} · ${new Date().toLocaleDateString()} · SMP Oct Buy List</p>
      <div class="card" style="margin-top:18px">
        <table><tr><th>Part #</th><th>Core #</th><th>QTY</th><th>Price</th><th>Total</th></tr>${rows || `<tr><td colspan="5">No cores yet.</td></tr>`}</table>
        <p>Total units: <strong>${units}</strong></p>
        <p>Box total: <strong>$${boxTotal.toFixed(2)}</strong></p>
      </div>
      <p style="margin-top:18px"><button type="button" onclick="window.print()">Print</button> <a class="button" href="/workloads/${workload.id}/report">Excel report</a> <a class="button ghost" href="/modules/workloads">Complete boxes</a></p>`));
    return;
  }

  const qtyMatch = url.pathname.match(/^\/workloads\/([^/]+)\/qty$/);
  if (qtyMatch && req.method === "POST") {
    const workload = db.workloads.find((item) => item.id === qtyMatch[1] && item.tenantId === session.tenantId);
    if (!workload || !roleCanOpen(session.role, "workloads")) {
      send(res, 403, "Not available");
      return;
    }
    const body = await parseBody(req);
    const partNumber = String(body.get("partNumber") || "").trim();
    const change = Number(body.get("change") || 0);
    if (change < 0) {
      const index = db.scans.findIndex((scan) => scan.workloadId === workload.id && scan.confirmedPartNumber === partNumber);
      if (index >= 0) db.scans.splice(index, 1);
    }
    if (change > 0 && partNumber) {
      const known = reference().numbers.get(partNumber);
      const existing = db.scans.find((scan) => scan.workloadId === workload.id && scan.confirmedPartNumber === partNumber);
      db.scans.push({
        id: crypto.randomUUID(), tenantId: session.tenantId, workloadId: workload.id,
        confirmedPartNumber: partNumber, coreNumber: existing ? existing.coreNumber : (known ? (known.coreNumber || "") : ""),
        photoCount: 0, photosDeleted: true, inDatabase: Boolean(known),
        wasCorrected: true, confirmedBy: session.userId, confirmedAt: new Date().toISOString()
      });
    }
    save(db);
    res.writeHead(302, { location: `/workloads/${workload.id}` });
    res.end();
    return;
  }

  const finishMatch = url.pathname.match(/^\/workloads\/([^/]+)\/finish$/);
  if (finishMatch && req.method === "POST") {
    const workload = db.workloads.find((item) => item.id === finishMatch[1] && item.tenantId === session.tenantId);
    if (!workload || !roleCanOpen(session.role, "workloads")) {
      send(res, 403, "Not available");
      return;
    }
    if (!workload.poNumber) {
      const used = db.workloads.filter((item) => item.tenantId === session.tenantId && item.poNumber).map((item) => Number(String(item.poNumber).replace("PO-", "")));
      workload.poNumber = `PO-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
    }
    workload.status = "complete";
    save(db);
    res.writeHead(302, { location: session.role === "manager" ? `/workloads/${workload.id}/ticket` : `/workloads/${workload.id}?done=1` });
    res.end();
    return;
  }

  const deleteMatch = url.pathname.match(/^\/workloads\/([^/]+)\/delete$/);
  if (deleteMatch && req.method === "POST") {
    const workload = db.workloads.find((item) => item.id === deleteMatch[1] && item.tenantId === session.tenantId);
    if (!workload || session.role !== "manager") {
      send(res, 403, "Not available");
      return;
    }
    db.reports = db.reports || [];
    db.reports.push({
      id: workload.id, tenantId: workload.tenantId, name: workload.name, poNumber: workload.poNumber || "",
      lines: qtyRows(db, workload.id), archivedAt: new Date().toISOString()
    });
    workload.status = "archived";
    save(db);
    res.writeHead(302, { location: "/modules/workloads" });
    res.end();
    return;
  }

  const scanMatch = url.pathname.match(/^\/workloads\/([^/]+)\/scans$/);
  if (scanMatch && req.method === "POST") {
    const workload = db.workloads.find((item) => item.id === scanMatch[1] && item.tenantId === session.tenantId);
    if (!workload || !roleCanOpen(session.role, "core_processing")) {
      send(res, 403, "Not available");
      return;
    }
    const body = await parseBody(req);
    const photos = body.getAll("photo").filter(Boolean);
    if (!photos.length) {
      send(res, 400, "Add at least one photo, or type the part number.", { "content-type": "application/json" });
      return;
    }
    if (session.tenantId !== "tenant_born_again_air") {
      send(res, 200, JSON.stringify({ partNumber: null, page: null }), { "content-type": "application/json" });
      return;
    }
    const dir = path.join(dataDir, "files", session.tenantId);
    fs.mkdirSync(dir, { recursive: true });
    const filePaths = photos.map((photo) => {
      const filePath = path.join(dir, crypto.randomUUID());
      fs.writeFileSync(filePath, Buffer.from(photo, "base64"));
      return filePath;
    });
    let match = null;
    try { match = await matchPhotos(filePaths); } catch (error) { match = null; }
    filePaths.forEach((filePath) => fs.unlinkSync(filePath));
    send(res, 200, JSON.stringify(match || { partNumber: null, page: null, source: null, visual: [] }), { "content-type": "application/json" });
    return;
  }

  const confirmMatch = url.pathname.match(/^\/workloads\/([^/]+)\/confirm$/);
  if (confirmMatch && req.method === "POST") {
    const workload = db.workloads.find((item) => item.id === confirmMatch[1] && item.tenantId === session.tenantId);
    if (!workload || !roleCanOpen(session.role, "core_processing")) {
      send(res, 403, "Not available");
      return;
    }
    const body = await parseBody(req);
    const partNumber = String(body.get("partNumber") || "").trim();
    if (!partNumber) {
      res.writeHead(302, { location: `/workloads/${workload.id}` });
      res.end();
      return;
    }
    const known = reference().numbers.get(partNumber);
    db.scans.push({
      id: crypto.randomUUID(), tenantId: session.tenantId, workloadId: workload.id,
      confirmedPartNumber: partNumber, coreNumber: known ? (known.coreNumber || "") : "",
      photoCount: 3, photosDeleted: true, inDatabase: Boolean(known),
      wasCorrected: true, confirmedBy: session.userId, confirmedAt: new Date().toISOString()
    });
    save(db);
    res.writeHead(302, { location: `/labels/${db.scans[db.scans.length - 1].id}?ask=1` });
    res.end();
    return;
  }

  const referenceMatch = url.pathname.match(/^\/reference\/four-seasons\/(\d+)$/);
  if (referenceMatch) {
    if (session.tenantId !== "tenant_born_again_air") {
      send(res, 404, "Not available");
      return;
    }
    const filePath = path.join(__dirname, "reference", "fs-pages", `page-${String(referenceMatch[1]).padStart(3, "0")}.jpg`);
    if (!fs.existsSync(filePath)) {
      send(res, 404, "Not available");
      return;
    }
    res.writeHead(200, { "content-type": "image/jpeg" });
    res.end(fs.readFileSync(filePath));
    return;
  }

  const refMatch = url.pathname.match(/^\/reference\/four-season\/(\d+)$/);
  if (refMatch) {
    if (!bornAgainOnly(session)) {
      send(res, 404, page("Not available", `<h1>Not available</h1><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    const pageNo = referenceData().fsPages[refMatch[1]];
    if (!pageNo) {
      send(res, 404, page("Not in database", `${brand()}<h1>Not in the 4 Season Database</h1><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    const image = path.join(__dirname, "reference", "fs-pages", `page-${String(pageNo).padStart(3, "0")}.jpg`);
    send(res, 200, page(refMatch[1], `${brand()}<h1>${refMatch[1]}</h1><p class="sub">4 Season Database image only.</p><img src="/reference/four-season-file/${pageNo}" alt="4 Season Database page">`));
    return;
  }

  const refFileMatch = url.pathname.match(/^\/reference\/four-season-file\/(\d+)$/);
  if (refFileMatch) {
    if (!bornAgainOnly(session)) {
      send(res, 404, "Not available");
      return;
    }
    const image = path.join(__dirname, "reference", "fs-pages", `page-${String(refFileMatch[1]).padStart(3, "0")}.jpg`);
    res.writeHead(200, { "content-type": "image/jpeg" });
    res.end(fs.readFileSync(image));
    return;
  }

  const squareMatch = url.pathname.match(/^\/reference\/square\/(page-\d+-\d+-\d+\.jpg)$/);
  if (squareMatch) {
    if (!bornAgainOnly(session)) {
      send(res, 404, "Not available");
      return;
    }
    const image = path.join(__dirname, "reference", "fs-parts", squareMatch[1]);
    if (!fs.existsSync(image)) {
      send(res, 404, "Not available");
      return;
    }
    res.writeHead(200, { "content-type": "image/jpeg" });
    res.end(fs.readFileSync(image));
    return;
  }

  const fileMatch = url.pathname.match(/^\/files\/([^/]+)$/);
  if (fileMatch) {
    const file = db.files.find((item) => item.id === fileMatch[1] && item.tenantId === session.tenantId);
    if (!file) {
      send(res, 404, "Not available");
      return;
    }
    const filePath = path.join(dataDir, "files", session.tenantId, file.id);
    res.writeHead(200, { "content-type": file.type || "image/jpeg" });
    res.end(fs.readFileSync(filePath));
    return;
  }

  if (url.pathname === "/modules/reports") {
    if (!session.tenantId || session.role !== "manager") {
      send(res, 404, page("Not available", `<h1>Not available</h1><p>Employees do not open Reports.</p><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    const saved = (db.reports || []).filter((item) => item.tenantId === session.tenantId);
    const live = db.workloads.filter((item) => item.tenantId === session.tenantId && item.status !== "open" && !saved.some((report) => report.id === item.id));
    const rows = saved.map((item) => `<tr><td>${item.poNumber || "Not ticketed"}</td><td>${item.name}</td><td>${item.lines.reduce((sum, line) => sum + line.qty, 0)}</td><td><a href="/workloads/${item.id}/ticket">P.O. ticket</a></td><td><a href="/workloads/${item.id}/report">Excel</a></td></tr>`).concat(live.map((item) => {
      const qty = db.scans.filter((scan) => scan.workloadId === item.id).length;
      return `<tr><td>${item.poNumber || "Not ticketed"}</td><td>${item.name}</td><td>${qty}</td><td><a href="/workloads/${item.id}/ticket">P.O. ticket</a></td><td><a href="/workloads/${item.id}/report">Excel</a></td></tr>`;
    })).join("");
    send(res, 200, page("Reports", `
      ${header(session)}<h1>Reports</h1>
      <p class="sub">Boxes processed by this company, including employee boxes.</p>
      <div class="card" style="margin-top:18px"><table><tr><th>P.O.</th><th>Box</th><th>Cores</th><th>Ticket</th><th>Excel</th></tr>${rows || `<tr><td colspan="5">No boxes yet.</td></tr>`}</table></div>`));
    return;
  }

  if (url.pathname === "/modules/pricing") {
    if (!session.tenantId || session.role !== "manager") {
      send(res, 404, page("Not available", `<h1>Not available</h1><p>Employees do not see Pricing.</p><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    const sheet = activePriceSheet(session.tenantId);
    const shot = path.join(dataDir, "files", session.tenantId, "price-sheet-shot.jpg");
    const shotHtml = fs.existsSync(shot) ? `<img src="/pricing/shot" alt="Monthly price sheet screenshot">` : `<p class="meta">No screenshot yet.</p>`;
    send(res, 200, page("Pricing", `
      ${header(session)}<h1>Pricing</h1>
      <p class="sub">The active file is the one the P.O. ticket uses.</p>
      <div class="card" style="margin-top:18px">
        <p>Active file</p>
        <p><a class="button" href="/pricing/file">SMP - Oct Buy List.xlsx</a></p>
        <p class="meta">Click the file to open it. Edit it, then update it here.</p>
        <form id="price-form">
          <label>Updated file<input id="sheet" type="file" accept=".xlsx,.pdf,image/*"></label>
          <button type="submit">Update active file</button>
          <p class="meta" id="price-status"></p>
        </form>
      </div>
      <script>
        document.getElementById("price-form").addEventListener("submit", async (event) => {
          event.preventDefault();
          const file = document.getElementById("sheet").files[0];
          const status = document.getElementById("price-status");
          status.textContent = "Saving the monthly sheet...";
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
          const body = new URLSearchParams();
          body.set("name", file.name);
          body.set("file", btoa(binary));
          const response = await fetch("/pricing/upload", { method: "POST", body });
          const result = await response.json();
          status.textContent = result.message || "Saved.";
          if (result.ok) setTimeout(() => location.reload(), 600);
        });
      </script>`));
    return;
  }

  if (url.pathname === "/pricing/file") {
    if (!session.tenantId || session.role !== "manager") {
      send(res, 404, "Not available");
      return;
    }
    const uploaded = path.join(dataDir, "files", session.tenantId, "active-price.xlsx");
    const file = fs.existsSync(uploaded) ? uploaded : path.join(__dirname, "reference", "SMP-Oct-Buy-List.xlsx");
    res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": "attachment; filename=SMP-Oct-Buy-List.xlsx" });
    res.end(fs.readFileSync(file));
    return;
  }

  if (url.pathname === "/pricing/save" && req.method === "POST") {
    if (!session.tenantId || session.role !== "manager") {
      send(res, 403, "Not available");
      return;
    }
    const body = await parseBody(req);
    const parts = body.getAll("part");
    const prices = body.getAll("price");
    const sheet = activePriceSheet(session.tenantId).map((row, index) => ({ ...row, price: Number(prices[index]) || row.price }));
    const dir = path.join(dataDir, "files", session.tenantId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "price-sheet.json"), JSON.stringify(sheet));
    res.writeHead(302, { location: "/modules/pricing" });
    res.end();
    return;
  }

  if (url.pathname === "/pricing/shot") {
    if (!session.tenantId || session.role !== "manager") {
      send(res, 404, "Not available");
      return;
    }
    const shot = path.join(dataDir, "files", session.tenantId, "price-sheet-shot.jpg");
    if (!fs.existsSync(shot)) {
      send(res, 404, "Not available");
      return;
    }
    res.writeHead(200, { "content-type": "image/jpeg" });
    res.end(fs.readFileSync(shot));
    return;
  }

  if (url.pathname === "/pricing/upload" && req.method === "POST") {
    if (!session.tenantId || session.role !== "manager") {
      send(res, 403, JSON.stringify({ ok: false, message: "Not available" }), { "content-type": "application/json" });
      return;
    }
    const body = await parseBody(req);
    const name = String(body.get("name") || "");
    const file = Buffer.from(String(body.get("file") || ""), "base64");
    const dir = path.join(dataDir, "files", session.tenantId);
    fs.mkdirSync(dir, { recursive: true });
    if (name.toLowerCase().endsWith(".xlsx")) {
      const prices = parsePriceWorkbook(file);
      if (!prices.length) {
        send(res, 200, JSON.stringify({ ok: false, message: "That spreadsheet had no prices." }), { "content-type": "application/json" });
        return;
      }
      const current = path.join(dir, "price-sheet.json");
      if (fs.existsSync(current)) fs.copyFileSync(current, path.join(dir, `price-sheet-${Date.now()}.json`));
      fs.writeFileSync(path.join(dir, "active-price.xlsx"), file);
      fs.writeFileSync(current, JSON.stringify(prices));
      send(res, 200, JSON.stringify({ ok: true, message: `Active sheet updated. ${prices.length} prices.` }), { "content-type": "application/json" });
      return;
    }
    fs.writeFileSync(path.join(dir, "price-sheet-shot.jpg"), file);
    send(res, 200, JSON.stringify({ ok: true, message: "Screenshot saved. Drop the spreadsheet file to change the prices." }), { "content-type": "application/json" });
    return;
  }

  if (url.pathname.startsWith("/modules/")) {
    const key = url.pathname.slice("/modules/".length);
    const enabled = db.tenantModules.find((item) => item.tenantId === session.tenantId && item.moduleKey === key && item.enabled);
    const mod = enabled && roleCanOpen(session.role, key) && db.modules.find((item) => item.key === key);
    if (!mod) {
      send(res, 404, page("Not available", `<h1>Not available</h1><p>This is not available for your role.</p><a class="button" href="/dashboard">Back</a>`));
      return;
    }
    send(res, 200, page(mod.name, `
      <p class="mark">${session.tenantName}</p><h1>${mod.name}</h1><p class="sub">${mod.description}</p>
      <div class="card" style="margin-top:18px"><p>This module is enabled for this company. Processing screens are not built yet.</p>
      <p class="meta">Next build: workload, photo, confirm or change part number, label, report.</p>
      <a class="button" href="/dashboard">Back to workspace</a></div>`));
    return;
  }

  send(res, 404, page("Not found", "<h1>Not found</h1>"));
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${PORT}`);
  console.log(`PAL Business Solutions is running at http://localhost:${PORT}`);
  if (ips.length) console.log(`On your phone, same Wi-Fi, open ${ips.join(" or ")}`);
});
