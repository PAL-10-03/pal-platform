const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'data', 'pal.db'));

// Init tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    company TEXT,
    role TEXT
  );
  CREATE TABLE IF NOT EXISTS workloads (
    id INTEGER PRIMARY KEY,
    company TEXT,
    po TEXT,
    status TEXT,
    created TEXT
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    workload_id INTEGER,
    type TEXT,
    part TEXT,
    core TEXT,
    core_charge REAL,
    price REAL,
    qty INTEGER DEFAULT 1
  );
`);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.PAL_SESSION_SECRET || 'pal-secret',
  resave: false,
  saveUninitialized: false
}));

const upload = multer({ dest: 'uploads/' });

// Sample price data (replace with real BAA / Four Seasons loads)
const baaPrices = {}; // load from data/baa.xlsx
const fsCatalog = {}; // load from data/fourseasons

function loadPrices() {
  try {
    const wb = XLSX.readFile(path.join(__dirname, 'data', 'SMP - Oct Buy List.xlsx'));
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    rows.forEach(r => {
      if (r.Part) baaPrices[r.Part] = r;
    });
  } catch (e) {}
}
loadPrices();

function lookupCore(part) {
  const row = baaPrices[part];
  if (!row) return null;
  return {
    part: row.Part,
    core: row.Core || row.Part,
    price: row.Price || 0,
    coreCharge: row.CoreCharge || 65.5
  };
}

app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('home', { user: req.session.user });
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = user;
    return res.redirect('/');
  }
  res.render('login', { error: 'Bad login' });
});

app.get('/compressors', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('compressors', { user: req.session.user });
});

app.post('/compressors/match', upload.array('photos'), async (req, res) => {
  // Label first, then visual
  let numbers = [];
  for (const f of req.files || []) {
    const { data: { text } } = await Tesseract.recognize(f.path, 'eng');
    const found = text.match(/\d{5,}/g) || [];
    numbers.push(...found);
  }
  let match = null;
  for (const n of numbers) {
    match = lookupCore(n);
    if (match) break;
  }
  // If no label match, fall back to visual (stub - real visual would compare to Four Seasons squares)
  if (!match) match = { part: 'UNKNOWN', core: 'NO MATCH', price: 0, coreCharge: 0 };

  res.json({
    part: match.part,
    core: match.core,
    coreCharge: match.coreCharge,
    price: match.price
  });
});

app.get('/workloads', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const rows = db.prepare('SELECT * FROM workloads WHERE company = ?').all(req.session.user.company);
  res.render('workloads', { user: req.session.user, workloads: rows });
});

app.listen(PORT, () => console.log('PAL running on ' + PORT));
