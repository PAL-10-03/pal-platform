const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'pal-secret-key',
  resave: false,
  saveUninitialized: false
}));

const users = {
  'admin': { password: bcrypt.hashSync('admin123', 10), role: 'admin', company: 'PAL' },
  'bornagain': { password: bcrypt.hashSync('air123', 10), role: 'manager', company: 'Born Again Air' },
  'employee': { password: bcrypt.hashSync('emp123', 10), role: 'employee', company: 'Born Again Air' }
};

app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('home', { user: req.session.user });
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users[username];
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.user = { username, role: user.role, company: user.company };
    return res.redirect('/');
  }
  res.render('login', { error: 'Wrong username or password' });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/cores', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('cores', { user: req.session.user });
});

app.get('/compressors', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('compressors', { user: req.session.user });
});

app.listen(PORT, () => {
  console.log('PAL running on port ' + PORT);
});
