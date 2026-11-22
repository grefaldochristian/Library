/* =========================================================
   LIBCENTRAL / BASAHUB - script.js  (OFFLINE COVERS v2 + FIXED LOGIN SOUND)
   - Data is stored in the browser (localStorage). Demo system.
   - Backup export/import and reset are in Admin > Insights.
   - Late fine: PHP 50.00 per day past due, per late book.
   - Forgot password for the staff (Admin) and Student accounts.
   - Every book has a DIFFERENT offline cover generated from
     its own title (color + symbol + pattern + tilt).
   - Login sound uses Web Audio API (no MP3 file needed).
========================================================= */
'use strict';

const DB_KEY = 'libcentral_db_v2';
const SESSION_KEY = 'libcentral_session_v2';
const LATE_FINE = 50; /* per day past due, per late book */
const MAX_LOANS = 5;
const MAX_DAYS = 30;
const DEFAULT_DAYS = 14;
const RESET_MINUTES = 10;
const RESET_MAX_TRIES = 5;

let db = null;
let currentUser = null;
let currentView = 'home-view';
let payTarget = null;
let editingBookId = null;
let pendingCover = '';
let toastTimer = null;
let lastBookId = null;
let loginAudioCtx = null;

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = (n) => '₱' + Number(n || 0).toFixed(2);
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const normEmail = (e) => String(e || '').trim().toLowerCase();
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
const initials = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

function endOfDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

/* ---------- storage ---------- */
const SEED_BOOKS = [
  ['Clean Code', 'Robert C. Martin', 'Computer Science', 'Programming', '9780132350884'],
  ['Introduction to Algorithms', 'Thomas H. Cormen et al.', 'Computer Science', 'Algorithms', '9780262046305'],
  ['Pride and Prejudice', 'Jane Austen', 'Literature', 'Classic', '9780141439518'],
  ['A Brief History of Time', 'Stephen Hawking', 'Science', 'Physics', '9780553380163'],
  ['Sapiens', 'Yuval Noah Harari', 'History', 'Anthropology', '9780062316097'],
  ['Thinking, Fast and Slow', 'Daniel Kahneman', 'Psychology', 'Cognitive Science', '9780374533557'],
  ['Calculus: Early Transcendentals', 'James Stewart', 'Mathematics', 'Calculus', '9781285741550'],
  ['The Lean Startup', 'Eric Ries', 'Business', 'Entrepreneurship', '9780307887894'],
  ['Pedagogy of the Oppressed', 'Paulo Freire', 'Education', 'Teaching', '9780826412768'],
  ['Atomic Habits', 'James Clear', 'General', 'Self-Help', '9780735211292'],
  ['The Pragmatic Programmer', 'Andrew Hunt & David Thomas', 'Computer Science', 'Software Engineering', '9780135957059'],
  ['Design Patterns', 'Erich Gamma et al.', 'Computer Science', 'Software Engineering', '9780201633610'],
  ['Code Complete', 'Steve McConnell', 'Computer Science', 'Programming', '9780735619678'],
  ['Artificial Intelligence: A Modern Approach', 'Stuart Russell & Peter Norvig', 'Computer Science', 'Artificial Intelligence', '9780134610993'],
  ['To Kill a Mockingbird', 'Harper Lee', 'Literature', 'Classic', '9780061120084'],
  ['Nineteen Eighty-Four', 'George Orwell', 'Literature', 'Dystopian', '9780451524935'],
  ['The Great Gatsby', 'F. Scott Fitzgerald', 'Literature', 'Classic', '9780743273565'],
  ['Jane Eyre', 'Charlotte Brontë', 'Literature', 'Classic', '9780141441146'],
  ['Cosmos', 'Carl Sagan', 'Science', 'Astronomy', '9780345539434'],
  ['The Selfish Gene', 'Richard Dawkins', 'Science', 'Biology', '9780198788607'],
  ['Astrophysics for People in a Hurry', 'Neil deGrasse Tyson', 'Science', 'Physics', '9780393609394'],
  ['A Short History of Nearly Everything', 'Bill Bryson', 'Science', 'General Science', '9780767908184'],
  ['Guns, Germs, and Steel', 'Jared Diamond', 'History', 'World History', '9780393354324'],
  ['The Diary of a Young Girl', 'Anne Frank', 'History', 'Biography', '9780553296983'],
  ['A People\'s History of the United States', 'Howard Zinn', 'History', 'American History', '9780062397348'],
  ['SPQR', 'Mary Beard', 'History', 'Ancient History', '9781631492228'],
  ['Man\'s Search for Meaning', 'Viktor E. Frankl', 'Psychology', 'Psychotherapy', '9780807014271'],
  ['Influence', 'Robert B. Cialdini', 'Psychology', 'Social Psychology', '9780061241895'],
  ['Mindset', 'Carol S. Dweck', 'Psychology', 'Motivation', '9780345472328'],
  ['Emotional Intelligence', 'Daniel Goleman', 'Psychology', 'Emotional Intelligence', '9780553383713'],
  ['Linear Algebra and Its Applications', 'David C. Lay et al.', 'Mathematics', 'Linear Algebra', '9780321982384'],
  ['How to Solve It', 'George Pólya', 'Mathematics', 'Problem Solving', '9780691164076'],
  ['Discrete Mathematics and Its Applications', 'Kenneth H. Rosen', 'Mathematics', 'Discrete Math', '9781259676512'],
  ['Fermat\'s Enigma', 'Simon Singh', 'Mathematics', 'Number Theory', '9780802713315'],
  ['Zero to One', 'Peter Thiel with Blake Masters', 'Business', 'Entrepreneurship', '9780804139298'],
  ['Good to Great', 'Jim Collins', 'Business', 'Management', '9780066620992'],
  ['Rich Dad Poor Dad', 'Robert T. Kiyosaki', 'Business', 'Personal Finance', '9781612680194'],
  ['Start with Why', 'Simon Sinek', 'Business', 'Leadership', '9781591846444'],
  ['Make It Stick', 'Peter C. Brown et al.', 'Education', 'Learning', '9780674729018'],
  ['Visible Learning', 'John Hattie', 'Education', 'Teaching', '9780415476188'],
  ['Experience and Education', 'John Dewey', 'Education', 'Philosophy of Education', '9780684838281'],
  ['How Learning Works', 'Susan A. Ambrose et al.', 'Education', 'Learning', '9780470484104'],
  ['Deep Work', 'Cal Newport', 'General', 'Productivity', '9781455586691'],
  ['The Alchemist', 'Paulo Coelho', 'General', 'Fiction', '9780062315007'],
  ['Educated', 'Tara Westover', 'General', 'Memoir', '9780399590528'],
  ['Ikigai', 'Héctor García & Francesc Miralles', 'General', 'Self-Help', '9780143130727']
];
const SEED_VERSION = 3;

function seedBook(n, s, bookNo) {
  return {
    id: 'b' + n, bookNo: bookNo || 'LC-' + String(n).padStart(3, '0'), title: s[0], author: s[1],
    category: s[2], genre: s[3], isbn: s[4], cover: '', status: 'Available'
  };
}

function seedDb() {
  return {
    users: [
      { id: 'u-admin', name: 'System Admin', email: 'admin@lib.edu', password: '123456', role: 'Admin', status: 'Active' },
      { id: 'u-stu', name: 'Demo Student', email: 'student@lib.edu', password: '123456', role: 'Student', status: 'Active' }
    ],
    books: SEED_BOOKS.map((s, i) => seedBook(i + 1, s)),
    loans: [], holds: [], payments: [], log: [], resets: {}, seedV: SEED_VERSION, lastBackupAt: null
  };
}

function addMissingSeedBooks(d) {
  const have = new Set(d.books.map((b) => b.isbn));
  const ids = new Set(d.books.map((b) => b.id));
  SEED_BOOKS.forEach((s, i) => {
    if (have.has(s[4])) return;
    const id = ids.has('b' + (i + 1)) ? uid('b') : 'b' + (i + 1);
    const b = seedBook(0, s, nextBookNo(d.books));
    b.id = id;
    d.books.push(b); ids.add(id); have.add(s[4]);
  });
}

/* A reservation can only be handed to a student who is allowed to borrow it */
function holdEligibleIn(d, h) {
  const u = d.users.find((x) => x.id === h.userId);
  const b = d.books.find((x) => x.id === h.bookId);
  if (!u || u.role !== 'Student' || u.status !== 'Active') return false;
  if (!b || b.status === 'Withdrawn') return false;
  if (d.loans.some((l) => l.userId === h.userId && l.bookId === h.bookId && !l.returnedAt)) return false;
  if (d.loans.filter((l) => l.userId === h.userId && !l.returnedAt).length >= MAX_LOANS) return false;
  return true;
}

/* FULL RESERVATION SYNC:
   - cancels ineligible holds
   - one Ready hold per book
   - queue follows arrival order
   - book status follows the queue
*/
function normalizeHolds(d) {
  let changed = false;
  const setHold = (h, status) => { if (h.status !== status) { h.status = status; changed = true; } };
  const setBook = (b, status) => { if (b.status !== status) { b.status = status; changed = true; } };

  d.holds.forEach((h) => {
    if (h.status !== 'Pending' && h.status !== 'Ready') return;
    const b = d.books.find((x) => x.id === h.bookId);
    const u = d.users.find((x) => x.id === h.userId);

    if (!b || !u || b.status === 'Withdrawn') { setHold(h, 'Cancelled'); return; }
    if (u.role !== 'Student' || u.status !== 'Active') { setHold(h, 'Cancelled'); return; }
    if (d.loans.some((l) => l.userId === h.userId && l.bookId === h.bookId && !l.returnedAt)) { setHold(h, 'Cancelled'); return; }
    if (d.loans.filter((l) => l.userId === h.userId && !l.returnedAt).length >= MAX_LOANS) setHold(h, 'Cancelled');
  });

  d.books.forEach((b) => {
    if (b.status === 'Withdrawn') return;

    const queue = d.holds
      .filter((h) => h.bookId === b.id && (h.status === 'Pending' || h.status === 'Ready'))
      .sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt));

    const busy = d.loans.some((l) => l.bookId === b.id && !l.returnedAt);

    if (busy) {
      queue.forEach((h) => setHold(h, 'Pending'));
      setBook(b, 'Checked Out');
      return;
    }

    const next = queue.find((h) => holdEligibleIn(d, h));
    queue.forEach((h) => setHold(h, h === next ? 'Ready' : 'Pending'));
    setBook(b, next ? 'On Hold' : 'Available');
  });

  return changed;
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.users) && Array.isArray(d.books)) {
        d.loans = d.loans || []; d.holds = d.holds || []; d.payments = d.payments || [];
        d.log = d.log || []; d.resets = d.resets || {}; d.lastBackupAt = d.lastBackupAt || null;
        if ((d.seedV || 1) < SEED_VERSION) { addMissingSeedBooks(d); d.seedV = SEED_VERSION; }
        /* One staff account only: retire the old Librarian role, then heal reservations. */
        d.users = d.users.filter((u) => u.role !== 'Librarian');
        normalizeHolds(d);
        return d;
      }
    }
  } catch (e) { /* fall through to seed */ }
  return seedDb();
}

function saveDb() {
  if (db) normalizeHolds(db);
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return true;
  } catch (e) {
    toast('Could not save data (browser storage is full or blocked).', 'error');
    return false;
  }
}

/* ---------- toast ---------- */
function toast(msg, type) {
  let t = $('lib-toast');
  if (!t) { t = document.createElement('div'); t.id = 'lib-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.setAttribute('data-type', type || 'success');
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3300);
}

/* ---------- domain helpers ---------- */
const getUser = (id) => db.users.find((u) => u.id === id);
const getBook = (id) => db.books.find((b) => b.id === id);
const getLoan = (id) => db.loans.find((l) => l.id === id);
const userName = (id) => (getUser(id) ? getUser(id).name : 'Unknown');
const bookTitle = (id) => (getBook(id) ? getBook(id).title : 'Deleted book');
const isStaff = () => currentUser && currentUser.role === 'Admin';

function isOverdue(l) { return !l.returnedAt && Date.now() > new Date(l.dueAt).getTime(); }

function daysLate(l) {
  const end = l.returnedAt ? new Date(l.returnedAt).getTime() : Date.now();
  const due = new Date(l.dueAt).getTime();
  return end > due ? Math.max(1, Math.ceil((end - due) / 86400000)) : 0;
}

function loanFine(l) {
  if (l.finePaid) return l.fineAmount || LATE_FINE;
  return daysLate(l) * LATE_FINE;
}
function unpaidFine(l) { return l.finePaid ? 0 : loanFine(l); }
const activeLoans = () => db.loans.filter((l) => !l.returnedAt);
const userLoans = (uidv) => db.loans.filter((l) => l.userId === uidv);
const userUnpaid = (uidv) => userLoans(uidv).reduce((s, l) => s + unpaidFine(l), 0);
const fmtDue = (l) => (l.test ? fmtDateTime(l.dueAt) : fmtDate(l.dueAt));

function activeHolds(bookId) {
  return db.holds.filter((h) => (h.status === 'Pending' || h.status === 'Ready') && (!bookId || h.bookId === bookId))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}
function queuePos(h) { return activeHolds(h.bookId).findIndex((x) => x.id === h.id) + 1; }

function addLog(stage, bookId, userId, note) {
  db.log.unshift({ date: new Date().toISOString(), stage, bookId: bookId || '', userId: userId || '', note: note || '' });
  if (db.log.length > 300) db.log.length = 300;
}

function nextBookNo(list) {
  const max = (list || db.books).reduce((m, b) => { const x = /^LC-(\d+)$/i.exec(b.bookNo || ''); return x ? Math.max(m, +x[1]) : m; }, 0);
  return 'LC-' + String(max + 1).padStart(3, '0');
}

/* =========================================================
   OFFLINE BOOK COVER ENGINE v2
   - Color, symbol, pattern and tilt come from the BOOK TITLE hash.
   - Same-category books no longer look identical.
   - Subject is shown as a small label only.
   - The cover is an inline SVG data URI => works OFFLINE.
========================================================== */

/* 12 color pairs - picked per book */
const COVER_PALETTES = [
  ['#2f6bb5', '#15365c'], ['#8a4fb3', '#4b2668'], ['#0f8a8a', '#0a5c5c'],
  ['#2f8f4e', '#15532b'], ['#a65d2e', '#6b3716'], ['#be4b6c', '#7a2340'],
  ['#5a55c4', '#33307a'], ['#3a6d7e', '#204450'], ['#c98a1b', '#8a5a06'],
  ['#b23a48', '#6e1f2a'], ['#137a7f', '#0a4a4d'], ['#6b4fbb', '#3d2d70']
];

const SUBJECT_LABEL = {
  'Computer Science': 'COMPUTER SCIENCE',
  'Literature': 'LITERATURE',
  'Education': 'EDUCATION',
  'Science': 'SCIENCE',
  'History': 'HISTORY',
  'Psychology': 'PSYCHOLOGY',
  'Mathematics': 'MATHEMATICS',
  'Business': 'BUSINESS',
  'General': 'GENERAL'
};

/* Each subject has 2 symbols - the title hash picks one */
const SUBJECT_ICONS = {
  'Computer Science': ['code', 'chip'],
  'Literature':       ['book', 'feather'],
  'Education':        ['cap', 'chalk'],
  'Science':          ['flask', 'atom'],
  'History':          ['columns', 'hourglass'],
  'Psychology':       ['brain', 'heart'],
  'Mathematics':      ['compass', 'sigma'],
  'Business':         ['chart', 'briefcase'],
  'General':          ['star', 'bulb']
};

/* 18 clean symbols, each drawn inside a 100 x 100 box */
const COVER_ICONS = {
  'code': '<g fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M35 28 L10 50 L35 72"/><path d="M65 28 L90 50 L65 72"/><path d="M58 20 L42 80"/></g>',
  'chip': '<g fill="none" stroke="#fff" stroke-width="6"><rect x="26" y="26" width="48" height="48" rx="6"/><rect x="40" y="40" width="20" height="20" rx="3"/><path d="M38 26 V12 M62 26 V12 M38 74 V88 M62 74 V88 M26 38 H12 M26 62 H12 M74 38 H88 M74 62 H88"/></g>',

  'book': '<g fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"><path d="M50 32 C35 21 16 21 7 27 L7 73 C18 67 36 67 50 77 C64 67 82 67 93 73 L93 27 C84 21 65 21 50 32 Z"/><path d="M50 32 L50 77"/></g>',
  'feather': '<g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M78 16 C40 24 22 48 22 78 L18 92 L34 86 C64 84 82 56 78 16 Z"/><path d="M28 84 L72 30"/></g>',

  'cap': '<g fill="#fff"><path d="M50 16 L94 37 L50 58 L6 37 Z"/><path d="M22 49 L22 69 C22 82 38 90 50 90 C62 90 78 82 78 69 L78 49 L50 64 Z" opacity=".85"/><path d="M94 37 L94 68" stroke="#fff" stroke-width="5" fill="none"/><circle cx="94" cy="72" r="4"/></g>',
  'chalk': '<g fill="none" stroke="#fff" stroke-width="6"><rect x="10" y="16" width="80" height="60" rx="5"/><path d="M28 62 L42 34 L56 62 M32 54 H52"/><path d="M70 34 V60 M70 60 H84"/></g>',

  'flask': '<g fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"><path d="M38 16 L62 16"/><path d="M44 16 L44 42 L22 78 C16 89 23 94 33 94 L67 94 C77 94 84 89 78 78 L56 42 L56 16"/><path d="M30 74 L70 74" stroke-width="6"/></g>',
  'atom': '<g fill="none" stroke="#fff" stroke-width="5"><ellipse cx="50" cy="50" rx="40" ry="16"/><ellipse cx="50" cy="50" rx="40" ry="16" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="40" ry="16" transform="rotate(120 50 50)"/><circle cx="50" cy="50" r="7" fill="#fff" stroke="none"/></g>',

  'columns': '<g fill="#fff"><path d="M8 18 H92 V29 H8 Z"/><path d="M8 18 H24 V84 H8 Z"/><path d="M76 18 H92 V84 H76 Z"/><path d="M36 40 H64 V84 H36 Z" opacity=".8"/><path d="M6 84 H94 V94 H6 Z"/></g>',
  'hourglass': '<g fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"><path d="M30 14 H70 M30 86 H70"/><path d="M34 14 L34 34 L50 50 L34 66 L34 86"/><path d="M66 14 L66 34 L50 50 L66 66 L66 86"/></g>',

  'brain': '<g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"><path d="M50 90 C23 90 14 73 18 55 C10 41 20 23 36 25 C42 13 62 13 68 25 C84 23 92 41 84 55 C88 73 77 90 50 90 Z"/><path d="M50 27 L50 90"/><path d="M33 45 C40 45 44 52 40 60"/><path d="M67 45 C60 45 56 52 60 60"/></g>',
  'heart': '<path d="M50 86 C20 66 8 48 8 34 C8 20 20 12 34 12 C42 12 48 16 50 22 C52 16 58 12 66 12 C80 12 92 20 92 34 C92 48 80 66 50 86 Z" fill="#fff"/>',

  'compass': '<g fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"><circle cx="50" cy="50" r="36"/><path d="M50 8 L50 18 M50 82 L50 92 M8 50 L18 50 M82 50 L92 50"/><path d="M63 37 L44 44 L37 63 L56 56 Z" fill="#fff" stroke="none"/></g>',
  'sigma': '<text x="50" y="78" text-anchor="middle" font-family="Georgia,serif" font-size="78" font-weight="700" fill="#fff">Σ</text>',

  'chart': '<g fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 88 H90"/><path d="M20 88 V62 M40 88 V46 M60 88 V68 M80 88 V28"/><path d="M18 60 L42 40 L62 58 L82 22" stroke-width="6"/></g>',
  'briefcase': '<g fill="none" stroke="#fff" stroke-width="6"><rect x="12" y="34" width="76" height="50" rx="6"/><path d="M38 34 V24 H62 V34 M12 52 H88 M44 52 V66 H56 V52"/></g>',

  'star': '<g fill="#fff"><path d="M50 8 L60 38 L92 38 L66 56 L76 88 L50 68 L24 88 L34 56 L8 38 L40 38 Z"/></g>',
  'bulb': '<g fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"><path d="M50 12 C30 12 20 26 20 42 C20 56 30 62 34 72 H66 C70 62 80 56 80 42 C80 26 70 12 50 12 Z"/><path d="M38 82 H62 M42 90 H58"/></g>'
};

/* helpers */
function xml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}
function cutText(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
  const b = Math.min(255, Math.max(0, (n & 255) + amt));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function wrapTitle(text, max) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  words.forEach((w) => {
    if (line && (line + ' ' + w).length > max) { lines.push(line); line = w; }
    else { line = line ? line + ' ' + w : w; }
  });
  if (line) lines.push(line);
  if (lines.length > 4) { lines.length = 4; lines[3] = lines[3].replace(/\s+\S*$/, '') + '…'; }
  return lines.length ? lines : ['Untitled'];
}
function coverPattern(kind) {
  if (kind === 0) return '<pattern id="p" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2.5" fill="#fff" opacity=".5"/></pattern>';
  if (kind === 1) return '<pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><line x1="0" y1="0" x2="0" y2="24" stroke="#fff" stroke-width="2" opacity=".45"/></pattern>';
  if (kind === 2) return '<pattern id="p" width="44" height="22" patternUnits="userSpaceOnUse"><path d="M0 11 Q11 0 22 11 T44 11" fill="none" stroke="#fff" stroke-width="2" opacity=".4"/></pattern>';
  return '<pattern id="p" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="17" cy="17" r="10" fill="none" stroke="#fff" stroke-width="2" opacity=".35"/></pattern>';
}

/* Build one unique offline cover from the book itself */
function offlineCover(b) {
  b = b || {};
  const cat = SUBJECT_LABEL[b.category] ? b.category : 'General';
  const label = SUBJECT_LABEL[cat] || 'GENERAL';

  /* The title drives the design, so no two books look the same */
  const seed = String(b.title || '') + '|' + String(b.isbn || '') + '|' + String(b.id || '');
  const h = hash32(seed);

  const pal = COVER_PALETTES[h % COVER_PALETTES.length];
  const delta = ((h >>> 16) % 5 - 2) * 6;
  const c1 = shade(pal[0], delta);
  const c2 = shade(pal[1], Math.round(delta / 2));

  const icons = SUBJECT_ICONS[cat] || SUBJECT_ICONS['General'];
  const icon = COVER_ICONS[icons[(h >>> 4) % icons.length]] || COVER_ICONS.star;
  const patternKind = (h >>> 8) % 4;
  const tilt = (h >>> 12) % 9 - 4;

  const titleLines = wrapTitle(b.title, 14);
  const titleSvg = titleLines.map((t, i) =>
    '<text x="150" y="' + (240 + i * 34) + '" text-anchor="middle" font-family="Arial,sans-serif" ' +
    'font-size="26" font-weight="800" fill="#fff">' + xml(t) + '</text>').join('');

  const author = xml(cutText(b.author || 'Unknown author', 30));
  const meta = xml(cutText([b.bookNo, b.genre].filter(Boolean).join('  •  ') || label, 34));

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">' +
      '<defs>' +
        '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/>' +
        '</linearGradient>' +
        coverPattern(patternKind) +
      '</defs>' +
      '<rect width="300" height="450" rx="16" fill="url(#g)"/>' +
      '<rect width="300" height="450" rx="16" fill="url(#p)" opacity=".18"/>' +
      '<rect x="12" y="12" width="276" height="426" rx="10" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>' +

      '<rect x="60" y="30" width="180" height="28" rx="14" fill="#fff" fill-opacity=".18"/>' +
      '<text x="150" y="49" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" ' +
            'font-weight="700" letter-spacing="1" fill="#fff">' + xml(label) + '</text>' +

      '<g transform="translate(95 66) scale(1.1) rotate(' + tilt + ' 50 50)" opacity=".95">' + icon + '</g>' +

      titleSvg +

      '<line x1="60" y1="380" x2="240" y2="380" stroke="#fff" stroke-opacity=".6" stroke-width="1.5"/>' +
      '<text x="150" y="408" text-anchor="middle" font-family="Georgia,serif" font-size="16" fill="#fff" fill-opacity=".95">' + author + '</text>' +
      '<text x="150" y="434" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" letter-spacing=".6" fill="#fff" fill-opacity=".75">' + meta + '</text>' +
    '</svg>';

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function placeholderCover(b) { return offlineCover(b || {}); }

function coverFor(b) {
  b = b || {};
  /* Uploaded images are kept. Otherwise generate the offline cover. */
  return b.cover ? b.cover : offlineCover(b);
}

function coverFallback(img) {
  img.onerror = null;
  const id = img.getAttribute && img.getAttribute('data-book-id');
  let b = id ? getBook(id) : null;
  if (!b) b = { title: (img.getAttribute && img.getAttribute('alt')) || '', category: '' };
  img.src = offlineCover(b);
}

const coverAttrs = (b) => ' data-book-id="' + esc(b.id) + '" onerror="coverFallback(this)"';

/* ---------- navigation ---------- */
const PROTECTED = {
  'profile-view': () => !!currentUser,
  'member-dashboard-view': () => currentUser && currentUser.role === 'Student',
  'admin-dashboard-view': () => currentUser && currentUser.role === 'Admin'
};

function switchView(id) {
  if (PROTECTED[id] && !PROTECTED[id]()) {
    if (!currentUser) toast('Please sign in first.', 'warning');
    else toast('You do not have access to that page.', 'error');
    id = currentUser ? homeFor(currentUser) : 'login-view';
  }
  const target = $(id);
  if (!target) return;
  document.querySelectorAll('.view-section').forEach((v) => v.classList.remove('active'));
  target.classList.add('active');
  currentView = id;

  document.querySelectorAll('.nav-link').forEach((a) => {
    const on = (a.getAttribute('onclick') || '').indexOf("'" + id + "'") !== -1;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  closeMenu();
  renderView(id);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function homeFor(u) {
  return u.role === 'Admin' ? 'admin-dashboard-view' : 'member-dashboard-view';
}

function renderView(id) {
  switch (id) {
    case 'home-view': renderHome(); break;
    case 'catalog-view': renderCatalog(); break;
    case 'profile-view': renderProfile(); break;
    case 'member-dashboard-view': renderMember(); break;
    case 'admin-dashboard-view': populateIssueSelects(); renderAdmin(); break;
    default: break;
  }
}

function closeMenu() {
  const nav = $('nav-links'), btn = $('hamburger-btn');
  if (nav) nav.classList.remove('active');
  if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.textContent = '☰'; }
}

function updateNav() {
  const u = currentUser;
  $('nav-auth-actions').style.display = u ? 'none' : '';
  $('nav-user-actions').style.display = u ? '' : 'none';
  $('profile-link').style.display = u ? '' : 'none';
  $('member-link').style.display = u && u.role === 'Student' ? '' : 'none';
  $('admin-link').style.display = u && u.role === 'Admin' ? '' : 'none';
  if (u) {
    const av = $('user-avatar');
    av.textContent = initials(u.name);
    av.setAttribute('data-role', u.role);
    $('user-display-name').textContent = u.name;
  }
}

/* ---------- authentication ---------- */
function playLoginSound() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    if (!loginAudioCtx) loginAudioCtx = new C();
    const ctx = loginAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = t0 + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.start(t);
      o.stop(t + 0.3);
    });
  } catch (e) { /* sound is optional */ }
}

function handleLogin(e) {
  e.preventDefault();
  const email = normEmail($('login-email').value);
  const pass = $('login-password').value;
  const u = db.users.find((x) => normEmail(x.email) === email && x.password === pass);
  if (!u) return toast('Invalid email or password.', 'error');
  if (u.status === 'Pending') return toast('Your account is still waiting for admin approval.', 'warning');
  if (u.status === 'Blocked') return toast('This account has been blocked. Please contact the library.', 'error');
  currentUser = u;
  try { localStorage.setItem(SESSION_KEY, u.id); } catch (err) { /* ignore */ }
  $('login-password').value = '';
  updateNav();
  playLoginSound();
  toast('Welcome back, ' + u.name + '!');
  switchView(homeFor(u));
}

function handleSignup(e) {
  e.preventDefault();
  const name = $('signup-name').value.trim();
  const email = normEmail($('signup-email').value);
  const pass = $('signup-password').value;
  if (name.length < 2) return toast('Please enter your full name.', 'error');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Please enter a valid email address.', 'error');
  if (pass.length < 6) return toast('Password must be at least 6 characters.', 'error');
  if (db.users.some((u) => normEmail(u.email) === email)) return toast('That email is already registered.', 'error');
  db.users.push({ id: uid('u'), name, email, password: pass, role: 'Student', status: 'Pending' });
  addLog('New Record', '', db.users[db.users.length - 1].id, 'Account registered - waiting for approval');
  if (!saveDb()) return;
  e.target.reset();
  toast('Account created! Please wait for admin approval before signing in.');
  $('login-email').value = email;
  switchView('login-view');
}

function logout() {
  currentUser = null;
  try { localStorage.removeItem(SESSION_KEY); } catch (err) { /* ignore */ }
  updateNav();
  toast('You have been signed out.');
  switchView('home-view');
}

/* ---------- forgot password ---------- */
function openForgot() {
  const typed = $('login-email') ? $('login-email').value.trim() : '';
  forgotBack();
  if (typed) $('forgot-email').value = typed;
  switchView('forgot-view');
}

function forgotBack() {
  $('forgot-request-form').classList.remove('hidden');
  $('forgot-reset-form').classList.add('hidden');
  ['forgot-code', 'forgot-new-password', 'forgot-confirm-password'].forEach((id) => { $(id).value = ''; });
  $('forgot-code-hint').innerHTML = '';
}

function handleForgotRequest(e) {
  e.preventDefault();
  const email = normEmail($('forgot-email').value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Please enter a valid email address.', 'error');
  const u = db.users.find((x) => normEmail(x.email) === email);
  if (!u) return toast('No account was found with that email address.', 'error');
  if (u.status === 'Blocked') return toast('This account is blocked. Please contact the library.', 'error');

  const buf = new Uint32Array(1);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  const code = String(100000 + (buf[0] % 900000));
  db.resets[email] = { code, expires: Date.now() + RESET_MINUTES * 60000, tries: 0 };
  if (!saveDb()) return;
  addLog('Account', '', u.id, 'Password reset requested');
  saveDb();

  $('forgot-reset-desc').textContent = 'Resetting the ' + u.role.toLowerCase() + ' account ' + u.email + '.';
  $('forgot-code-hint').innerHTML = '<strong>Your reset code</strong><span class="reset-code">' + esc(code) +
    '</span><span>Demo mode: no email is sent, so the code is shown here. It expires in ' + RESET_MINUTES + ' minutes.</span>';
  $('forgot-request-form').classList.add('hidden');
  $('forgot-reset-form').classList.remove('hidden');
  $('forgot-code').focus();
}

function handleForgotReset(e) {
  e.preventDefault();
  const email = normEmail($('forgot-email').value);
  const r = db.resets[email];
  const code = $('forgot-code').value.trim();
  const p1 = $('forgot-new-password').value;
  const p2 = $('forgot-confirm-password').value;

  if (!r) { forgotBack(); return toast('Please request a new reset code.', 'warning'); }
  if (Date.now() > r.expires) { delete db.resets[email]; saveDb(); forgotBack(); return toast('That code has expired. Please request a new one.', 'error'); }
  if (!/^\d{6}$/.test(code)) return toast('Enter the 6-digit reset code.', 'error');
  if (code !== r.code) {
    r.tries++;
    if (r.tries >= RESET_MAX_TRIES) { delete db.resets[email]; saveDb(); forgotBack(); return toast('Too many wrong attempts. Request a new code.', 'error'); }
    saveDb();
    return toast('Wrong code. ' + (RESET_MAX_TRIES - r.tries) + ' attempt(s) left.', 'error');
  }
  if (p1.length < 6) return toast('Password must be at least 6 characters.', 'error');
  if (p1 !== p2) return toast('Passwords do not match.', 'error');

  const u = db.users.find((x) => normEmail(x.email) === email);
  if (!u) { forgotBack(); return toast('Account no longer exists.', 'error'); }
  u.password = p1;
  delete db.resets[email];
  addLog('Account', '', u.id, 'Password was reset');
  if (!saveDb()) return;
  forgotBack();
  $('login-email').value = u.email;
  $('login-password').value = '';
  toast('Password updated. You can now sign in.');
  switchView('login-view');
}

/* ---------- home & catalog ---------- */
function bookCard(b) {
  const meta = [b.bookNo, b.genre].filter(Boolean).join(' · ');
  return '<article class="book-card" data-category="' + esc(b.category) + '">' +
    '<img class="book-cover" src="' + esc(coverFor(b)) + '" alt="Cover of ' + esc(b.title) + '" loading="lazy"' + coverAttrs(b) + '>' +
    '<div class="book-details"><span class="book-category">' + esc(b.category) + '</span>' +
    '<h3 class="book-title">' + esc(b.title) + '</h3>' +
    '<p class="book-author has-meta">' + esc(b.author) + '</p>' +
    '<p class="book-meta">' + esc(meta) + '</p>' +
    '<div class="book-status">' + statusBadge(b) +
    '<button class="btn btn-outline btn-sm" type="button" onclick="viewBook(\'' + b.id + '\')">View details</button></div></div></article>';
}

function statusBadge(b) {
  const m = { Available: 'badge-success', 'Checked Out': 'badge-danger', 'On Hold': 'badge-warning' };
  return '<span class="badge ' + (m[b.status] || '') + '">' + esc(b.status) + '</span>';
}
const roleChip = (r) => '<span class="role-chip role-' + esc(r.toLowerCase()) + '">' + esc(r) + '</span>';
const emptyRow = (n, msg) => '<tr><td colspan="' + n + '" style="text-align:center;color:var(--muted);padding:26px">' + esc(msg) + '</td></tr>';
const alertBox = (type, title, text) => '<div class="alert-box alert-' + type + '"><strong>' + esc(title) + '</strong><span>' + esc(text) + '</span></div>';

function renderHome() {
  $('home-total-books').textContent = db.books.length;
  $('home-available-books').textContent = db.books.filter((b) => b.status === 'Available').length;
  $('home-active-loans').textContent = activeLoans().length;
  $('home-total-members').textContent = db.users.filter((u) => u.role === 'Student').length;
  const feat = db.books.filter((b) => b.status === 'Available').slice(0, 3);
  $('home-featured-books').innerHTML = feat.length ? feat.map(bookCard).join('') :
    '<div class="empty-state"><div>📚</div><h3>No books available right now</h3><p>Please check back soon.</p></div>';
}

function renderCatalog() {
  const sel = $('catalog-genre-filter');
  const keep = sel.value || 'ALL';
  const genres = [...new Set(db.books.map((b) => b.genre).filter(Boolean))].sort();
  sel.innerHTML = '<option value="ALL">All Genres</option>' + genres.map((g) => '<option>' + esc(g) + '</option>').join('');
  sel.value = genres.indexOf(keep) !== -1 ? keep : 'ALL';

  const q = $('catalog-search-input').value.trim().toLowerCase();
  const cat = $('catalog-category-filter').value;
  const gen = sel.value;
  const st = $('catalog-status-filter').value;
  const list = db.books.filter((b) =>
    (cat === 'ALL' || b.category === cat) && (gen === 'ALL' || b.genre === gen) && (st === 'ALL' || b.status === st) &&
    (!q || [b.title, b.author, b.genre, b.bookNo, b.isbn, b.category].some((x) => String(x || '').toLowerCase().indexOf(q) !== -1)));
  $('catalog-results-count').textContent = list.length + (list.length === 1 ? ' book found' : ' books found');
  $('catalog-book-grid').innerHTML = list.length ? list.map(bookCard).join('') :
    '<div class="empty-state"><div>🔍</div><h3>No books found</h3><p>Try a different search or clear the filters.</p>' +
    '<button class="btn btn-outline" type="button" onclick="resetCatalogFilters()">Clear Filters</button></div>';
}

function resetCatalogFilters() {
  $('catalog-search-input').value = '';
  $('catalog-category-filter').value = 'ALL';
  $('catalog-genre-filter').value = 'ALL';
  $('catalog-status-filter').value = 'ALL';
  renderCatalog();
}

/* ---------- book details, borrow, reserve ---------- */
function viewBook(id) {
  lastBookId = id;
  renderBookDetails(id);
  switchView('book-details-view');
}

function renderBookDetails(id) {
  const b = getBook(id);
  const box = $('book-details-container');
  if (!b) { box.innerHTML = '<div class="empty-state"><h3>Book not found</h3></div>'; return; }

  let actions = '';
  const u = currentUser;
  if (!u) {
    actions = '<p class="notice-text">Sign in with a student account to borrow or reserve this book.</p>' +
      '<button class="btn btn-primary" type="button" onclick="switchView(\'login-view\')">Sign In</button>';
  } else if (u.role !== 'Student') {
    actions = '<p class="notice-text">Staff accounts issue books from the dashboard.</p>';
  } else {
    const myLoan = activeLoans().find((l) => l.userId === u.id && l.bookId === b.id);
    const myHold = activeHolds(b.id).find((h) => h.userId === u.id);
    const canBorrow = (myHold && myHold.status === 'Ready') || (b.status === 'Available' && !activeHolds(b.id).length);
    if (myLoan) {
      actions = '<p class="notice-text">You are currently borrowing this book. Return by ' + esc(fmtDue(myLoan)) + '.</p>';
    } else if (b.status === 'Withdrawn') {
      actions = '<p class="notice-text">This book has been withdrawn from the collection.</p>';
    } else if (canBorrow) {
      actions = '<div class="borrow-box"><div class="field"><label for="borrow-return-date">Choose your return date</label>' +
        '<input id="borrow-return-date" type="date" min="' + ymd(new Date()) + '" max="' + ymd(addDays(new Date(), MAX_DAYS)) + '" value="' + ymd(addDays(new Date(), DEFAULT_DAYS)) + '"></div>' +
        '<p class="borrow-hint">Up to ' + MAX_LOANS + ' books at a time, up to ' + MAX_DAYS + ' days. A late return costs ' + peso(LATE_FINE) + ' per day past due.</p>' +
        '<button class="btn btn-primary" type="button" onclick="borrowBook(\'' + b.id + '\')">Borrow this book</button></div>';
    } else if (myHold) {
      actions = '<p class="notice-text">You are #' + queuePos(myHold) + ' in the reservation queue.</p>' +
        '<button class="btn btn-outline" type="button" onclick="cancelHold(\'' + myHold.id + '\')">Cancel reservation</button>';
    } else {
      actions = '<button class="btn btn-primary" type="button" onclick="reserveBook(\'' + b.id + '\')">Reserve this book</button>';
    }
  }

  const life = db.log.filter((x) => x.bookId === b.id).slice(0, 6);
  const lifeHtml = life.length ? '<div class="lifecycle-box"><h3>Recent activity</h3><ul class="lifecycle-list">' +
    life.map((x) => '<li><span class="badge">' + esc(x.stage) + '</span><span>' + esc(fmtDate(x.date)) + ' — ' + esc(x.note) + '</span></li>').join('') + '</ul></div>' : '';

  box.innerHTML = '<div class="book-details-layout"><img src="' + esc(coverFor(b)) + '" alt="Cover of ' + esc(b.title) + '"' + coverAttrs(b) + '>' +
    '<div><span class="eyebrow">' + esc(b.category).toUpperCase() + '</span><h2>' + esc(b.title) + '</h2>' +
    '<p><strong>Author:</strong> ' + esc(b.author) + '</p>' +
    '<p><strong>Genre:</strong> ' + esc(b.genre || '—') + '</p>' +
    '<p><strong>Book no.:</strong> ' + esc(b.bookNo) + '</p>' +
    '<p><strong>ISBN:</strong> ' + esc(b.isbn) + '</p>' +
    '<p><strong>Status:</strong> ' + statusBadge(b) + '</p>' + lifeHtml +
    '<div class="form-actions">' + actions + '</div></div></div>';
}

function createLoan(userId, bookId, dueAt, extra) {
  const l = Object.assign({ id: uid('l'), userId, bookId, borrowedAt: new Date().toISOString(), dueAt: dueAt.toISOString(), returnedAt: null, finePaid: false, fineAmount: 0 }, extra || {});
  db.loans.push(l);
  getBook(bookId).status = 'Checked Out';
  addLog('Checked Out', bookId, userId, 'Return by ' + fmtDate(l.dueAt));
  return l;
}

function checkBorrowRules(userId, bookId, due) {
  const u = getUser(userId), b = getBook(bookId);
  if (!u || u.role !== 'Student') return 'Only student accounts can borrow books.';
  if (u.status !== 'Active') return 'This student account is not active.';
  if (!b) return 'Book not found.';
  if (userLoans(userId).filter((l) => !l.returnedAt).length >= MAX_LOANS) return 'Limit reached: a student can borrow up to ' + MAX_LOANS + ' books.';
  if (activeLoans().some((l) => l.userId === userId && l.bookId === bookId)) return 'This student already has that book.';
  if (due) {
    const today = endOfDay(ymd(new Date()));
    if (isNaN(due.getTime()) || due < today) return 'The return date cannot be in the past.';
    if (due > endOfDay(ymd(addDays(new Date(), MAX_DAYS)))) return 'The return date can be at most ' + MAX_DAYS + ' days from today.';
  }
  return '';
}

function borrowBook(bookId) {
  if (!currentUser || currentUser.role !== 'Student') return toast('Sign in as a student to borrow.', 'warning');
  const b = getBook(bookId);
  const myHold = activeHolds(bookId).find((h) => h.userId === currentUser.id);
  const ok = b && ((myHold && myHold.status === 'Ready') || (b.status === 'Available' && !activeHolds(bookId).length));
  if (!ok) { renderBookDetails(bookId); return toast('This book is not available right now.', 'warning'); }
  const val = $('borrow-return-date').value;
  if (!val) return toast('Please choose a return date.', 'error');
  const due = endOfDay(val);
  const err = checkBorrowRules(currentUser.id, bookId, due);
  if (err) return toast(err, 'error');
  if (myHold) myHold.status = 'Fulfilled';
  createLoan(currentUser.id, bookId, due);
  if (!saveDb()) return;
  toast('Borrowed "' + b.title + '". Return by ' + fmtDate(due) + '.');
  renderBookDetails(bookId);
}

function reserveBook(bookId) {
  if (!currentUser || currentUser.role !== 'Student') return toast('Sign in as a student to reserve.', 'warning');
  const b = getBook(bookId);
  if (!b) return toast('Book not found.', 'error');
  if (b.status === 'Withdrawn') return toast('This book was withdrawn.', 'error');
  if (activeLoans().some((l) => l.userId === currentUser.id && l.bookId === bookId)) return toast('You are already borrowing this book.', 'warning');
  if (activeHolds(bookId).some((h) => h.userId === currentUser.id)) return toast('You already reserved this book.', 'warning');

  const freeToBorrow = b.status === 'Available' && activeHolds(bookId).length === 0;
  if (freeToBorrow) {
    renderBookDetails(bookId);
    return toast('This book is available - you can borrow it now.', 'warning');
  }

  db.holds.push({ id: uid('h'), userId: currentUser.id, bookId, createdAt: new Date().toISOString(), status: 'Pending' });
  addLog('Pending Hold', bookId, currentUser.id, 'Reservation placed');
  normalizeHolds(db);
  if (!saveDb()) return;
  toast('Reserved! You will be notified in your dashboard when it is ready.');
  renderBookDetails(bookId);
}

function releaseBook(bookId) {
  const b = getBook(bookId);
  if (!b || b.status === 'Withdrawn') return;
  const queue = activeHolds(bookId);
  /* Only a student who can actually borrow gets the "Ready" slot */
  const next = queue.find((h) => holdEligibleIn(db, h));
  queue.forEach((h) => { h.status = h === next ? 'Ready' : 'Pending'; });
  if (next) {
    b.status = 'On Hold';
    addLog('Reserved', bookId, next.userId, 'Held for ' + userName(next.userId));
  } else {
    b.status = 'Available';
  }
}

function cancelHold(holdId) {
  const h = db.holds.find((x) => x.id === holdId);
  if (!h) return;
  if (!(currentUser && (isStaff() || currentUser.id === h.userId))) return;
  const wasReady = h.status === 'Ready';
  h.status = 'Cancelled';
  addLog('Pending Hold', h.bookId, h.userId, 'Reservation cancelled');
  if (wasReady) releaseBook(h.bookId);
  if (!saveDb()) return;
  toast('Reservation cancelled.');
  refreshLive();
  if (currentView === 'book-details-view' && lastBookId) renderBookDetails(lastBookId);
}

function fulfillHold(holdId) {
  const h = db.holds.find((x) => x.id === holdId);
  if (!h || h.status !== 'Ready') return toast('That reservation is not ready yet.', 'warning');
  const hb = getBook(h.bookId);
  if (!hb || hb.status === 'Withdrawn') return toast('That book is no longer available.', 'error');

  if (hb.status !== 'On Hold' || activeLoans().some((l) => l.bookId === h.bookId)) {
    normalizeHolds(db); saveDb(); populateIssueSelects(); refreshLive();
    return toast('That book is already checked out or no longer on hold.', 'warning');
  }

  const due = endOfDay(ymd(addDays(new Date(), DEFAULT_DAYS)));
  const err = checkBorrowRules(h.userId, h.bookId, due);
  if (err) {
    normalizeHolds(db); saveDb(); populateIssueSelects(); refreshLive();
    return toast(err, 'error');
  }

  h.status = 'Fulfilled';
  createLoan(h.userId, h.bookId, due);
  if (!saveDb()) return;
  populateIssueSelects();
  toast('Checked out for ' + userName(h.userId) + ' (return by ' + fmtDate(due) + ').');
  refreshLive();
}

/* ---------- staff ---------- */
function handleIssueBook(e, prefix) {
  e.preventDefault();
  const userId = $(prefix + '-user-select').value;
  const bookId = $(prefix + '-book-select').value;
  const val = $(prefix + '-due-input').value;
  if (!userId || !bookId || !val) return toast('Please choose a student, a book and a return date.', 'error');
  const b = getBook(bookId);
  if (!b || b.status !== 'Available') { populateIssueSelects(); return toast('That book is no longer available.', 'error'); }
  const due = endOfDay(val);
  const err = checkBorrowRules(userId, bookId, due);
  if (err) return toast(err, 'error');
  createLoan(userId, bookId, due);
  if (!saveDb()) return;
  toast('"' + b.title + '" issued to ' + userName(userId) + '.');
  populateIssueSelects();
  refreshLive();
}

function returnLoan(loanId) {
  const l = getLoan(loanId);
  if (!l || l.returnedAt) return;
  if (!currentUser || !(isStaff() || (currentUser.role === 'Student' && l.userId === currentUser.id))) return;
  l.returnedAt = new Date().toISOString();
  const fine = loanFine(l);
  addLog('Returned', l.bookId, l.userId, fine ? 'Returned late - fine ' + peso(fine) : 'Returned on time');
  releaseBook(l.bookId);
  if (!saveDb()) return;
  toast(fine ? 'Returned late. A ' + peso(fine) + ' fine applies.' : (isStaff() ? 'Book checked in. Thank you!' : 'Book returned on time - nothing to pay. Thank you!'), fine ? 'warning' : 'success');
  populateIssueSelects();
  refreshLive();
}

function studentReturn(loanId) {
  const l = getLoan(loanId);
  if (!l || l.returnedAt || !currentUser || l.userId !== currentUser.id) return;
  if (isOverdue(l) && !window.confirm('This book is past its return date, so ' + peso(LATE_FINE) + ' per day applies (' + daysLate(l) + ' day(s) so far). Return it anyway?')) return;
  returnLoan(loanId);
}

function collectFine(loanId) {
  const l = getLoan(loanId);
  if (!l || unpaidFine(l) <= 0) return;
  if (!isStaff()) return;
  const amount = unpaidFine(l);
  l.finePaid = true; l.fineAmount = amount;
  const ref = 'PAY-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
  db.payments.push({ ref, userId: l.userId, method: 'Library Desk Cash', account: '', date: new Date().toISOString(), amount, loanIds: [l.id] });
  addLog('Fine Paid', l.bookId, l.userId, peso(amount) + ' collected at desk');
  if (!saveDb()) return;
  toast(peso(amount) + ' fine collected.');
  refreshLive();
}

function populateIssueSelects() {
  const students = db.users.filter((u) => u.role === 'Student' && u.status === 'Active');
  const avail = db.books.filter((b) => b.status === 'Available');
  ['issue'].forEach((p) => {
    const us = $(p + '-user-select'), bs = $(p + '-book-select'), di = $(p + '-due-input');
    if (!us || !bs || !di) return;
    const ku = us.value, kb = bs.value;
    us.innerHTML = '<option value="">Select student…</option>' + students.map((u) => '<option value="' + u.id + '">' + esc(u.name) + ' (' + esc(u.email) + ')</option>').join('');
    bs.innerHTML = '<option value="">Select book…</option>' + avail.map((b) => '<option value="' + b.id + '">' + esc(b.title) + ' — ' + esc(b.bookNo) + '</option>').join('');
    if (students.some((u) => u.id === ku)) us.value = ku;
    if (avail.some((b) => b.id === kb)) bs.value = kb;
    di.min = ymd(new Date());
    di.max = ymd(addDays(new Date(), MAX_DAYS));
    if (!di.value) di.value = ymd(addDays(new Date(), DEFAULT_DAYS));
  });
}

/* ---------- profile ---------- */
function renderProfile() {
  const u = currentUser; if (!u) return;
  const av = $('profile-avatar');
  av.textContent = initials(u.name); av.setAttribute('data-role', u.role);
  $('profile-heading-name').textContent = u.name;
  $('profile-summary').innerHTML =
    '<div class="receipt-row"><span>Role</span><strong>' + esc(u.role) + '</strong></div>' +
    '<div class="receipt-row"><span>Email</span><strong>' + esc(u.email) + '</strong></div>' +
    '<div class="receipt-row"><span>Status</span><strong>' + esc(u.status) + '</strong></div>';
  $('profile-name').value = u.name;
  const rc = $('profile-role-chip'); rc.textContent = u.role; rc.className = 'role-chip role-' + u.role.toLowerCase();
  $('profile-email').value = u.email;
  ['profile-current-password', 'profile-new-password', 'profile-confirm-password'].forEach((id) => { $(id).value = ''; });
}

function handleProfileSave(e) {
  e.preventDefault();
  const u = currentUser; if (!u) return;
  const name = $('profile-name').value.trim();
  const email = normEmail($('profile-email').value);
  const cur = $('profile-current-password').value;
  const np = $('profile-new-password').value;
  const cp = $('profile-confirm-password').value;
  if (name.length < 2) return toast('Please enter your full name.', 'error');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Please enter a valid email address.', 'error');
  if (db.users.some((x) => x.id !== u.id && normEmail(x.email) === email)) return toast('That email is already used by another account.', 'error');
  const emailChanged = email !== normEmail(u.email);
  if (emailChanged || np || cp) {
    if (cur !== u.password) return toast('Current password is incorrect.', 'error');
  }
  if (np || cp) {
    if (np.length < 6) return toast('New password must be at least 6 characters.', 'error');
    if (np !== cp) return toast('New passwords do not match.', 'error');
    u.password = np;
  }
  u.name = name; u.email = email;
  if (!saveDb()) return;
  updateNav(); renderProfile();
  toast('Profile saved.');
}

/* ---------- member dashboard ---------- */
function renderMember() {
  const u = currentUser; if (!u) return;
  $('member-welcome-name').textContent = u.name;
  const mine = userLoans(u.id);
  const active = mine.filter((l) => !l.returnedAt);
  const holds = activeHolds().filter((h) => h.userId === u.id);
  const total = userUnpaid(u.id);

  $('member-active-loans-count').textContent = active.length;
  $('member-reservations-count').textContent = holds.length;
  $('member-total-fines').textContent = peso(total);
  $('pay-fines-btn').style.display = total > 0 ? '' : 'none';

  let alerts = '';
  active.forEach((l) => {
    if (l.finePaid) return;
    if (isOverdue(l)) alerts += alertBox('danger', 'Overdue: ' + bookTitle(l.bookId), daysLate(l) + ' day(s) late · ' + peso(loanFine(l)) + ' fine. Please return the book and pay the fine.');
    else if (new Date(l.dueAt) - Date.now() < 2 * 86400000) alerts += alertBox('warning', 'Due soon: ' + bookTitle(l.bookId), 'Return by ' + fmtDue(l) + ' to avoid ' + peso(LATE_FINE) + ' per day.');
  });
  holds.filter((h) => h.status === 'Ready').forEach((h) => { alerts += alertBox('info', 'Ready for pickup: ' + bookTitle(h.bookId), 'Borrow it from the book page or ask the admin at the desk.'); });
  $('member-due-alerts').innerHTML = alerts;

  $('member-loans-tbody').innerHTML = active.length ? active.map((l) => {
    const f = unpaidFine(l);
    const status = l.finePaid ? '<span class="badge badge-warning">Fine paid - not returned yet</span>' : isOverdue(l) ? '<span class="badge badge-danger">Overdue</span>' :
      (new Date(l.dueAt) - Date.now() < 2 * 86400000 ? '<span class="badge badge-warning">Due soon</span>' : '<span class="badge badge-success">On time</span>');
    const act = '<button class="btn btn-outline btn-sm" type="button" onclick="studentReturn(\'' + l.id + '\')">Return book</button>' +
      (f > 0 ? '<button class="btn btn-primary btn-sm" type="button" onclick="openPaymentModal(\'' + l.id + '\')">Pay ' + peso(f) + '</button>' :
        (l.finePaid ? '<span class="badge-paid">Paid</span>' : ''));
    return '<tr><td><strong>' + esc(bookTitle(l.bookId)) + '</strong></td><td>' + esc(fmtDateTime(l.borrowedAt)) + '</td><td>' + esc(fmtDue(l)) + '</td><td>' +
      (loanFine(l) ? peso(loanFine(l)) : '—') + '</td><td>' + status + '</td><td class="action-cell">' + act + '</td></tr>';
  }).join('') : emptyRow(6, 'You have no active loans.');

  const hist = mine.filter((l) => l.returnedAt).sort((a, b) => new Date(b.returnedAt) - new Date(a.returnedAt));
  $('member-history-tbody').innerHTML = hist.length ? hist.map((l) => {
    const f = loanFine(l);
    const cell = f ? peso(f) + (l.finePaid ? '<span class="badge-paid">Paid</span>' :
      '<button class="btn btn-primary btn-sm" type="button" onclick="openPaymentModal(\'' + l.id + '\')">Pay ' + peso(f) + '</button>') : 'No fine';
    const late = new Date(l.returnedAt).getTime() > new Date(l.dueAt).getTime();
    return '<tr><td><strong>' + esc(bookTitle(l.bookId)) + '</strong></td><td>' + esc(fmtDateTime(l.borrowedAt)) + '</td><td>' + esc(fmtDateTime(l.returnedAt)) +
      (late ? '<span class="badge-unpaid">Late</span>' : '<span class="badge-paid">On time</span>') + '</td><td>' + cell + '</td></tr>';
  }).join('') : emptyRow(4, 'No borrowing history yet.');

  $('member-holds-tbody').innerHTML = holds.length ? holds.map((h) =>
    '<tr><td><strong>' + esc(bookTitle(h.bookId)) + '</strong></td><td>' + esc(fmtDate(h.createdAt)) + '</td><td>' +
    (h.status === 'Ready' ? '<span class="badge badge-success">Ready for pickup</span>' : '#' + queuePos(h)) +
    '</td><td><button class="btn btn-outline btn-sm" type="button" onclick="cancelHold(\'' + h.id + '\')">Cancel</button></td></tr>').join('') : emptyRow(4, 'No reservations.');

  const pays = db.payments.filter((p) => p.userId === u.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  $('member-payments-tbody').innerHTML = pays.length ? pays.map((p) =>
    '<tr><td><strong>' + esc(p.ref) + '</strong></td><td>' + esc(fmtDateTime(p.date)) + '</td><td>' + esc(p.method) + '</td><td>' + peso(p.amount) + '</td></tr>').join('') : emptyRow(4, 'No payments yet.');
}

function startPaymentTest() {
  const u = currentUser;
  if (!u || u.role !== 'Student') return toast('Sign in as a student first.', 'warning');
  const b = db.books.find((x) => x.status === 'Available');
  if (!b) return toast('No available book for the test.', 'error');
  const err = checkBorrowRules(u.id, b.id, null);
  if (err) return toast(err, 'error');
  createLoan(u.id, b.id, new Date(Date.now() + 60000), { test: true });
  if (!saveDb()) return;
  toast('Test loan created. It becomes overdue in 1 minute and then costs ' + peso(LATE_FINE) + ' per day.', 'warning');
  renderMember();
}

/* ---------- admin ---------- */
function loanActionButtons(l) {
  let h = '<button class="btn btn-primary btn-sm" type="button" onclick="returnLoan(\'' + l.id + '\')">Check In</button>';
  if (unpaidFine(l) > 0) h += '<button class="btn btn-outline btn-sm" type="button" onclick="collectFine(\'' + l.id + '\')">Collect ' + peso(unpaidFine(l)) + '</button>';
  return h;
}

function renderAdmin() {
  const act = activeLoans();
  const overdue = act.filter(isOverdue);
  $('admin-total-books').textContent = db.books.length;
  $('admin-issued-books').textContent = act.length;
  $('admin-overdue-books').textContent = overdue.length;
  $('admin-total-users').textContent = db.users.filter((u) => u.role === 'Student').length;

  const pending = db.users.filter((u) => u.status === 'Pending').length;
  const readyHolds = activeHolds().filter((h) => h.status === 'Ready').length;
  let a = '';
  if (overdue.length) a += alertBox('danger', overdue.length + ' overdue loan(s)', peso(LATE_FINE) + ' per day past due, per late book.');
  if (pending) a += alertBox('warning', pending + ' account(s) waiting for approval', 'Open the Users tab to approve them.');
  if (readyHolds) a += alertBox('info', readyHolds + ' reservation(s) ready for checkout', 'Open the Reservations tab to check them out.');
  $('admin-alerts').innerHTML = a;

  const holds = activeHolds();
  const resBody = $('admin-reservations-tbody');
  if (resBody) resBody.innerHTML = holds.length ? holds.map((h) =>
    '<tr><td>' + esc(userName(h.userId)) + '</td><td><strong>' + esc(bookTitle(h.bookId)) + '</strong></td><td>' + esc(fmtDate(h.createdAt)) + ' · ' +
    (h.status === 'Ready' ? '<span class="badge badge-success">Ready</span>' : 'Queue #' + queuePos(h)) + '</td><td class="action-cell">' +
    (h.status === 'Ready' ? '<button class="btn btn-primary btn-sm" type="button" onclick="fulfillHold(\'' + h.id + '\')">Check Out</button>' : '') +
    '<button class="btn btn-outline btn-sm" type="button" onclick="cancelHold(\'' + h.id + '\')">Cancel</button></td></tr>').join('') : emptyRow(4, 'No pending reservations.');

  $('admin-loans-tbody').innerHTML = act.length ? act.map((l) =>
    '<tr><td>' + esc(userName(l.userId)) + '</td><td><strong>' + esc(bookTitle(l.bookId)) + '</strong></td><td>' + esc(fmtDateTime(l.borrowedAt)) + '</td><td>' + esc(fmtDue(l)) + '</td><td>' +
    (loanFine(l) ? peso(loanFine(l)) : '—') + '</td><td class="action-cell">' + loanActionButtons(l) + '</td></tr>').join('') : emptyRow(6, 'No active transactions.');

  $('genre-options').innerHTML = [...new Set(db.books.map((b) => b.genre).filter(Boolean))].map((g) => '<option value="' + esc(g) + '">').join('');

  $('admin-inventory-tbody').innerHTML = db.books.length ? db.books.map((b) => {
    const busy = activeLoans().some((l) => l.bookId === b.id) || activeHolds(b.id).length > 0;
    return '<tr><td><img class="inventory-cover" src="' + esc(coverFor(b)) + '" alt="Cover of ' + esc(b.title) + '"' + coverAttrs(b) + '></td><td><strong>' + esc(b.title) + '</strong><br><small>' + esc(b.author) + '</small></td><td>' + esc(b.bookNo) +
      '</td><td>' + esc(b.category) + '<br><small>' + esc(b.genre || '—') + '</small></td><td>' + esc(b.isbn) + '</td><td>' + statusBadge(b) + '</td><td class="action-cell">' +
      '<button class="btn btn-outline btn-sm" type="button" onclick="editBook(\'' + b.id + '\')">Edit</button>' +
      (b.status === 'Withdrawn' ? '<button class="btn btn-outline btn-sm" type="button" onclick="toggleWithdraw(\'' + b.id + '\')">Restore</button>' :
        (b.status === 'Available' ? '<button class="btn btn-outline btn-sm" type="button" onclick="toggleWithdraw(\'' + b.id + '\')">Withdraw</button>' : '')) +
      (busy ? '' : '<button class="btn btn-outline btn-sm" type="button" onclick="deleteBook(\'' + b.id + '\')">Delete</button>') + '</td></tr>';
  }).join('') : emptyRow(7, 'No books yet.');

  $('admin-users-tbody').innerHTML = db.users.map((u) => {
    const recs = userLoans(u.id).length;
    const fine = userUnpaid(u.id);
    const sb = u.status === 'Active' ? 'badge-success' : u.status === 'Pending' ? 'badge-warning' : 'badge-danger';
    let act = '';
    if (u.id !== currentUser.id && u.role !== 'Admin') {
      if (u.status === 'Pending') act += '<button class="btn btn-primary btn-sm" type="button" onclick="setUserStatus(\'' + u.id + '\',\'Active\')">Approve</button>';
      if (u.status === 'Active') act += '<button class="btn btn-outline btn-sm" type="button" onclick="setUserStatus(\'' + u.id + '\',\'Blocked\')">Block</button>';
      if (u.status === 'Blocked') act += '<button class="btn btn-outline btn-sm" type="button" onclick="setUserStatus(\'' + u.id + '\',\'Active\')">Unblock</button>';
    }
    return '<tr><td><strong>' + esc(u.name) + '</strong></td><td>' + esc(u.email) + '</td><td>' + roleChip(u.role) + '</td><td><span class="badge ' + sb + '">' + esc(u.status) + '</span></td><td>' +
      recs + ' loan(s)' + (fine ? '<br><small>Unpaid ' + peso(fine) + '</small>' : '') + '</td><td class="action-cell">' + (act || '—') + '</td></tr>';
  }).join('');

  renderInsights();

  const pays = db.payments.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  $('admin-total-fines').textContent = peso(pays.reduce((s, p) => s + p.amount, 0));
  $('admin-payments-tbody').innerHTML = pays.length ? pays.map((p) =>
    '<tr><td><strong>' + esc(p.ref) + '</strong></td><td>' + esc(userName(p.userId)) + '</td><td>' + esc(p.method) + '</td><td>' + esc(fmtDateTime(p.date)) + '</td><td>' + peso(p.amount) + '</td></tr>').join('') : emptyRow(5, 'No payments recorded yet.');
}

function renderInsights() {
  const act = activeLoans();
  const unpaid = db.loans.reduce((s, l) => s + unpaidFine(l), 0);
  const collected = db.payments.reduce((s, p) => s + p.amount, 0);
  $('ins-outstanding-fines').textContent = peso(unpaid);
  $('ins-collected-fines').textContent = peso(collected);
  $('ins-overdue').textContent = act.filter(isOverdue).length;
  $('ins-pending-returns').textContent = act.length;

  const counts = {};
  db.loans.concat(db.holds).forEach((x) => { const b = getBook(x.bookId); if (b && b.genre) counts[b.genre] = (counts[b.genre] || 0) + 1; });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const mx = rows.length ? rows[0][1] : 1;
  $('ins-genre-bars').innerHTML = rows.length ? rows.map((r) =>
    '<div class="bar-row"><span class="bar-label">' + esc(r[0]) + '</span><span class="bar-track"><span class="bar-fill" style="display:block;width:' + Math.round(r[1] / mx * 100) + '%"></span></span><strong>' + r[1] + '</strong></div>').join('') :
    '<p class="muted-note">No borrowing data yet.</p>';

  $('ins-pending-tbody').innerHTML = act.length ? act.map((l) =>
    '<tr><td>' + esc(userName(l.userId)) + '</td><td>' + esc(bookTitle(l.bookId)) + '</td><td>' + esc(fmtDateTime(l.borrowedAt)) + '</td><td>' + esc(fmtDue(l)) + '</td><td>' +
    (isOverdue(l) ? '<span class="badge badge-danger">Overdue</span>' : '<span class="badge badge-success">On time</span>') + '</td><td>' + (loanFine(l) ? peso(loanFine(l)) : '—') + '</td></tr>').join('') : emptyRow(6, 'No pending returns.');

  const pop = db.books.map((b) => ({ b, n: db.loans.filter((l) => l.bookId === b.id).length, r: db.holds.filter((h) => h.bookId === b.id).length }))
    .filter((x) => x.n || x.r).sort((a, b) => (b.n + b.r) - (a.n + a.r)).slice(0, 5);
  $('ins-popular-tbody').innerHTML = pop.length ? pop.map((x, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(x.b.title) + '</td><td>' + x.n + '</td><td>' + x.r + '</td></tr>').join('') : emptyRow(4, 'No data yet.');

  const stu = db.users.filter((u) => u.role === 'Student');
  $('ins-members-tbody').innerHTML = stu.length ? stu.map((u) => {
    const ls = userLoans(u.id);
    return '<tr><td>' + esc(u.name) + '</td><td>' + ls.filter((l) => !l.returnedAt).length + '</td><td>' + ls.length + '</td><td>' + (userUnpaid(u.id) ? peso(userUnpaid(u.id)) : '—') + '</td></tr>';
  }).join('') : emptyRow(4, 'No students yet.');

  $('ins-log-tbody').innerHTML = db.log.length ? db.log.slice(0, 30).map((x) =>
    '<tr><td>' + esc(fmtDateTime(x.date)) + '</td><td><span class="badge">' + esc(x.stage) + '</span></td><td>' + esc(x.bookId ? bookTitle(x.bookId) : '—') + '</td><td>' + esc(x.userId ? userName(x.userId) : '—') + '</td><td>' + esc(x.note) + '</td></tr>').join('') : emptyRow(5, 'No activity yet.');

  const monthKeys = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(d.getFullYear() + '-' + pad(d.getMonth() + 1));
  }
  const monthCounts = {};
  monthKeys.forEach((k) => { monthCounts[k] = 0; });
  const tx = db.loans.map((l) => l.borrowedAt).concat(db.holds.map((h) => h.createdAt));
  tx.forEach((iso) => {
    const d = new Date(iso);
    const k = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    if (k in monthCounts) monthCounts[k]++;
  });
  const mRows = monthKeys.map((k) => [k, monthCounts[k]]);
  const mMax = Math.max(1, ...mRows.map((r) => r[1]));
  $('ins-monthly-bars').innerHTML = mRows.some((r) => r[1]) ? mRows.map((r) =>
    '<div class="bar-row"><span class="bar-label">' + r[0] + '</span><span class="bar-track"><span class="bar-fill" style="display:block;width:' + Math.round(r[1] / mMax * 100) + '%"></span></span><strong>' + r[1] + '</strong></div>').join('') :
    '<p class="muted-note">No circulation data yet.</p>';

  const best = mRows.slice().sort((a, b) => b[1] - a[1])[0];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  tx.forEach((iso) => { dayCounts[new Date(iso).getDay()]++; });
  const bestDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
  const peak = best && best[1] ? best[0] + ' (' + best[1] + ' transaction' + (best[1] === 1 ? '' : 's') + ')' : 'No data yet';
  $('ins-peak-cycle').innerHTML =
    '<div class="receipt-row"><span>Peak month</span><strong>' + esc(peak) + '</strong></div>' +
    '<div class="receipt-row"><span>Peak day</span><strong>' + (tx.length ? dayNames[bestDayIdx] + ' (' + dayCounts[bestDayIdx] + ')' : 'No data yet') + '</strong></div>' +
    '<div class="receipt-row"><span>Total circulation events</span><strong>' + tx.length + '</strong></div>';

  renderDatabasePanel();
}

function dbTableInfo() {
  return [
    ['users', db.users.length],
    ['books', db.books.length],
    ['loans', db.loans.length],
    ['holds', db.holds.length],
    ['payments', db.payments.length],
    ['log', db.log.length],
    ['resets', Object.keys(db.resets || {}).length]
  ];
}

function renderDatabasePanel() {
  const box = $('ins-db-status');
  if (!box) return;
  const tables = dbTableInfo();
  const total = tables.reduce((s, r) => s + r[1], 0);
  const last = db.lastBackupAt ? fmtDateTime(db.lastBackupAt) : 'No backup yet';
  box.innerHTML =
    '<div class="receipt-row"><span>Data store</span><strong>Local relational store (JSON tables)</strong></div>' +
    '<div class="receipt-row"><span>Tables</span><strong>' + tables.length + ' (' + tables.map((r) => r[0]).join(', ') + ')</strong></div>' +
    '<div class="receipt-row"><span>Records</span><strong>' + total + '</strong></div>' +
    '<div class="receipt-row"><span>Last backup</span><strong>' + esc(last) + '</strong></div>';
}

function exportBackup() {
  const copy = JSON.parse(JSON.stringify(db));
  copy.users.forEach((u) => { delete u.password; });
  delete copy.resets;
  copy.meta = { app: 'LibCentral / BasaHub', version: SEED_VERSION, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'libcentral-backup-' + ymd(new Date()) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  db.lastBackupAt = new Date().toISOString();
  saveDb();
  renderDatabasePanel();
  toast('Backup downloaded (passwords are not included).');
}

function importBackup(e) {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (!/\.json$/i.test(f.name) && f.type !== 'application/json') return toast('Please choose a JSON backup file.', 'error');
  const reader = new FileReader();
  reader.onload = () => {
    let d;
    try { d = JSON.parse(reader.result); } catch (err) { return toast('That file is not valid JSON.', 'error'); }
    if (!d || !Array.isArray(d.users) || !Array.isArray(d.books)) return toast('That file is not a LibCentral backup.', 'error');
    if (!window.confirm('Replace current data with this backup? This cannot be undone.')) return;
    const old = db;
    d.loans = d.loans || []; d.holds = d.holds || []; d.payments = d.payments || [];
    d.log = d.log || []; d.resets = {}; d.seedV = SEED_VERSION;
    d.meta = d.meta || {};
    d.lastBackupAt = d.meta.exportedAt || new Date().toISOString();
    d.users.forEach((u) => {
      const prev = old && old.users.find((x) => normEmail(x.email) === normEmail(u.email) || x.id === u.id);
      u.password = prev ? prev.password : '123456';
    });
    d.users = d.users.filter((u) => u.role !== 'Librarian');
    db = d;
    normalizeHolds(db);
    if (!saveDb()) return;
    if (currentUser) {
      currentUser = getUser(currentUser.id) || null;
      try {
        if (currentUser) localStorage.setItem(SESSION_KEY, currentUser.id);
        else localStorage.removeItem(SESSION_KEY);
      } catch (err) { /* ignore */ }
    }
    updateNav();
    refreshLive();
    renderAdmin();
    toast('Backup restored. ' + db.books.length + ' books and ' + db.users.length + ' accounts loaded.');
  };
  reader.onerror = () => toast('That backup could not be read.', 'error');
  reader.readAsText(f);
}

function resetDemoData() {
  if (!isStaff()) return;
  if (!window.confirm('Reset all data to the original demo state? Current records will be lost.')) return;
  db = seedDb();
  normalizeHolds(db);
  if (!saveDb()) return;
  currentUser = null;
  try { localStorage.removeItem(SESSION_KEY); } catch (err) { /* ignore */ }
  updateNav();
  switchView('home-view');
  toast('Demo data restored.');
}

function setUserStatus(id, status) {
  const u = getUser(id);
  if (!u || u.role === 'Admin' || !isStaff()) return;
  u.status = status;
  addLog('Account', '', id, 'Account set to ' + status);
  normalizeHolds(db);
  if (!saveDb()) return;
  toast(u.name + ' is now ' + status + '.');
  populateIssueSelects();
  renderAdmin();
}

/* ---------- admin: inventory ---------- */
function switchTab(id, btn) {
  document.querySelectorAll('#admin-dashboard-view .tab-content').forEach((t) => { t.style.display = t.id === id ? '' : 'none'; });
  document.querySelectorAll('#admin-dashboard-view .tab-btn').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function handleCoverFile(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (!/^image\//.test(f.type)) { e.target.value = ''; return toast('Please choose an image file.', 'error'); }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 400, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      pendingCover = c.toDataURL('image/jpeg', 0.82);
      const pv = $('book-cover-preview'); pv.src = pendingCover; pv.style.display = '';
    };
    img.onerror = () => toast('That image could not be read.', 'error');
    img.src = reader.result;
  };
  reader.readAsDataURL(f);
}

function resetBookForm() {
  editingBookId = null; pendingCover = '';
  $('add-book-form').reset();
  $('book-form-title').textContent = 'Add New Book';
  $('book-save-btn').textContent = 'Add Book';
  $('book-cancel-btn').style.display = 'none';
  const pv = $('book-cover-preview'); pv.style.display = 'none'; pv.removeAttribute('src');
}

function handleSaveBook(e) {
  e.preventDefault();
  const title = $('book-title-input').value.trim();
  const author = $('book-author-input').value.trim();
  const isbn = $('book-isbn-input').value.trim();
  const category = $('book-category-input').value;
  const genre = $('book-genre-input').value.trim();
  let bookNo = $('book-no-input').value.trim();
  const url = $('book-cover-input').value.trim();
  if (!title || !author || !isbn) return toast('Title, author and ISBN are required.', 'error');
  if (db.books.some((b) => b.id !== editingBookId && b.isbn === isbn)) return toast('Another book already uses that ISBN.', 'error');
  if (bookNo && db.books.some((b) => b.id !== editingBookId && b.bookNo.toLowerCase() === bookNo.toLowerCase())) return toast('That book number is already used.', 'error');
  if (url && !/^https?:\/\//i.test(url)) return toast('Cover link must start with http:// or https://', 'error');

  if (editingBookId) {
    const b = getBook(editingBookId);
    Object.assign(b, { title, author, isbn, category, genre, bookNo: bookNo || b.bookNo });
    if (pendingCover) b.cover = pendingCover; else if (url) b.cover = url;
    addLog('Updated', b.id, '', 'Book details edited');
    toast('Book updated.');
  } else {
    const b = { id: uid('b'), bookNo: bookNo || nextBookNo(), title, author, category, genre, isbn, cover: pendingCover || url || '', status: 'Available' };
    db.books.push(b);
    addLog('New Record', b.id, '', 'Added to the collection');
    toast('Book added.');
  }
  if (!saveDb()) return;
  resetBookForm();
  populateIssueSelects();
  renderAdmin();
}

function editBook(id) {
  const b = getBook(id); if (!b) return;
  editingBookId = id; pendingCover = '';
  $('book-title-input').value = b.title;
  $('book-author-input').value = b.author;
  $('book-category-input').value = b.category;
  $('book-genre-input').value = b.genre || '';
  $('book-isbn-input').value = b.isbn;
  $('book-no-input').value = b.bookNo;
  $('book-cover-input').value = b.cover && /^https?:/i.test(b.cover) ? b.cover : '';
  $('book-cover-file').value = '';
  const pv = $('book-cover-preview');
  pv.onerror = () => { pv.onerror = null; pv.src = placeholderCover(b); };
  pv.src = coverFor(b); pv.style.display = '';
  $('book-form-title').textContent = 'Edit Book';
  $('book-save-btn').textContent = 'Save Changes';
  $('book-cancel-btn').style.display = '';
  switchTab('admin-inventory-tab', $('admin-inventory-tab-btn'));
  $('add-book-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function toggleWithdraw(id) {
  const b = getBook(id); if (!b) return;
  if (b.status === 'Withdrawn') { b.status = 'Available'; releaseBook(id); addLog('Restored', id, '', 'Returned to the collection'); }
  else if (b.status === 'Available') { b.status = 'Withdrawn'; addLog('Withdrawn', id, '', 'Removed from circulation'); }
  else return toast('Only available books can be withdrawn.', 'warning');
  if (!saveDb()) return;
  populateIssueSelects(); renderAdmin();
}

function deleteBook(id) {
  const b = getBook(id); if (!b) return;
  if (activeLoans().some((l) => l.bookId === id) || activeHolds(id).length) return toast('This book has active loans or reservations.', 'error');
  if (!window.confirm('Delete "' + b.title + '" permanently?')) return;
  db.books = db.books.filter((x) => x.id !== id);
  if (editingBookId === id) resetBookForm();
  if (!saveDb()) return;
  toast('Book deleted.');
  populateIssueSelects(); renderAdmin();
}

/* ---------- payment modal ---------- */
function payableLoans() {
  if (!currentUser) return [];
  const ids = payTarget;
  return userLoans(currentUser.id).filter((l) => unpaidFine(l) > 0 && (!ids || ids.indexOf(l.id) !== -1));
}

function openPaymentModal(loanId) {
  if (!currentUser || currentUser.role !== 'Student') return;
  payTarget = typeof loanId === 'string' ? [loanId] : null;
  const loans = payableLoans();
  if (!loans.length) return toast('You have no unpaid fines.', 'success');
  const total = loans.reduce((s, l) => s + unpaidFine(l), 0);
  $('payment-item-desc').textContent = 'Late fine (' + peso(LATE_FINE) + ' per day past due) for: ' + loans.map((l) => bookTitle(l.bookId)).join(', ') +
    (loans.some((l) => !l.returnedAt) ? '. Paying also marks the book you are still holding as returned.' : '');
  $('payment-modal-amount').textContent = peso(total);
  $('payment-form').reset();
  $('payment-form-wrap').style.display = '';
  $('payment-receipt').style.display = 'none';
  $('payment-title').textContent = 'Pay Library Fine';
  updatePaymentFields();
  $('payment-modal').style.display = 'flex';
  $('payment-method-select').focus();
}

function closePaymentModal() {
  $('payment-modal').style.display = 'none';
  payTarget = null;
  if (currentView === 'member-dashboard-view') renderMember();
}

function updatePaymentFields() {
  const m = $('payment-method-select').value;
  const cash = m === 'Library Desk Cash', card = m === 'Credit / Debit Card';
  $('cash-note').style.display = cash ? '' : 'none';
  $('online-pay-fields').style.display = cash ? 'none' : '';
  $('card-extra-fields').style.display = card ? '' : 'none';
  $('payment-account-label').textContent = card ? 'Card number' : m + ' mobile number';
  const inp = $('payment-account-number');
  inp.placeholder = card ? '1234 5678 9012 3456' : '09XX XXX XXXX';
  inp.maxLength = card ? 19 : 13;
  inp.value = '';
}

function processPayment(e) {
  e.preventDefault();
  const loans = payableLoans();
  if (!loans.length) { closePaymentModal(); return toast('No unpaid fines to pay.', 'warning'); }
  const method = $('payment-method-select').value;
  const digits = $('payment-account-number').value.replace(/\D/g, '');
  let account = '';

  if (method === 'GCash' || method === 'Maya') {
    if (!/^09\d{9}$/.test(digits)) return toast('Enter a valid 11-digit mobile number (09XXXXXXXXX).', 'error');
    account = '•••• ' + digits.slice(-4);
  } else if (method === 'Credit / Debit Card') {
    if (digits.length < 13 || digits.length > 19) return toast('Enter a valid card number.', 'error');
    const exp = /^(\d{2})\/(\d{2})$/.exec($('payment-card-expiry').value.trim());
    if (!exp || +exp[1] < 1 || +exp[1] > 12) return toast('Enter the expiry as MM/YY.', 'error');
    const now = new Date();
    if (2000 + +exp[2] < now.getFullYear() || (2000 + +exp[2] === now.getFullYear() && +exp[1] < now.getMonth() + 1)) return toast('This card has expired.', 'error');
    if (!/^\d{3,4}$/.test($('payment-card-cvv').value)) return toast('Enter the 3 or 4 digit security code.', 'error');
    account = '•••• ' + digits.slice(-4);
  } else {
    account = 'Paid at library desk';
  }

  const btn = $('payment-submit-btn');
  btn.classList.add('is-loading');
  setTimeout(() => {
    btn.classList.remove('is-loading');
    const fresh = payableLoans();
    if (!fresh.length) { closePaymentModal(); return; }
    const amount = fresh.reduce((s, l) => s + unpaidFine(l), 0);
    const ref = 'PAY-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    const date = new Date().toISOString();
    let returnedNow = false;
    fresh.forEach((l) => {
      l.fineAmount = unpaidFine(l); l.finePaid = true;
      addLog('Fine Paid', l.bookId, l.userId, peso(l.fineAmount) + ' via ' + method);
      if (!l.returnedAt) {
        l.returnedAt = new Date().toISOString();
        addLog('Returned', l.bookId, l.userId, 'Returned late - fine ' + peso(l.fineAmount) + ' paid');
        releaseBook(l.bookId);
        returnedNow = true;
      }
    });
    db.payments.push({ ref, userId: currentUser.id, method, account, date, amount, loanIds: fresh.map((l) => l.id) });
    if (!saveDb()) return;

    const rd = document.querySelector('#payment-receipt .modal-desc');
    if (rd) rd.textContent = returnedNow ? 'Payment successful. Your fine is settled and the book is marked as returned.' : 'Payment successful. Your fine status has been updated.';
    $('receipt-amount').textContent = peso(amount);
    $('receipt-ref').textContent = ref;
    $('receipt-method').textContent = method;
    $('receipt-account').textContent = account;
    $('receipt-items').textContent = fresh.map((l) => bookTitle(l.bookId)).join(', ');
    $('receipt-date').textContent = fmtDateTime(date);
    $('payment-form-wrap').style.display = 'none';
    $('payment-receipt').style.display = '';
    $('payment-title').textContent = 'Payment Receipt';
    renderMember();
  }, 450);
}

/* ---------- live refresh ---------- */
let lastTick = '';
function tickSig() {
  return activeLoans().map((l) => l.id + (isOverdue(l) ? 'o' : (new Date(l.dueAt) - Date.now() < 2 * 86400000 ? 's' : 'n'))).join('|');
}

function refreshLive() {
  switch (currentView) {
    case 'home-view': renderHome(); break;
    case 'member-dashboard-view': renderMember(); break;
    case 'admin-dashboard-view': renderAdmin(); break;
    default: break;
  }
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  db = loadDb();
  saveDb();

  try {
    const sid = localStorage.getItem(SESSION_KEY);
    const u = sid && getUser(sid);
    if (u && u.status === 'Active') currentUser = u;
  } catch (err) { /* ignore */ }

  const hb = $('hamburger-btn');
  hb.addEventListener('click', () => {
    const open = $('nav-links').classList.toggle('active');
    hb.setAttribute('aria-expanded', open ? 'true' : 'false');
    hb.textContent = open ? '✕' : '☰';
  });

  ['catalog-search-input', 'catalog-category-filter', 'catalog-genre-filter', 'catalog-status-filter'].forEach((id) => {
    $(id).addEventListener(id === 'catalog-search-input' ? 'input' : 'change', renderCatalog);
  });

  $('payment-method-select').addEventListener('change', updatePaymentFields);
  $('payment-account-number').addEventListener('input', (e) => {
    const card = $('payment-method-select').value === 'Credit / Debit Card';
    const d = e.target.value.replace(/\D/g, '').slice(0, card ? 16 : 11);
    e.target.value = card ? d.replace(/(.{4})/g, '$1 ').trim() : d.replace(/^(\d{4})(\d{0,3})(\d{0,4}).*/, (m, a, b, c) => [a, b, c].filter(Boolean).join(' '));
  });
  $('payment-card-expiry').addEventListener('input', (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
  });
  $('payment-card-cvv').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
  $('forgot-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
  $('payment-modal').addEventListener('click', (e) => { if (e.target === $('payment-modal')) closePaymentModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('payment-modal').style.display === 'flex') closePaymentModal(); });

  lastTick = tickSig();
  setInterval(() => {
    if (document.hidden) return;
    const healed = normalizeHolds(db);
    if (healed) { saveDb(); refreshLive(); }
    const s = tickSig();
    if (s !== lastTick) { lastTick = s; refreshLive(); }
  }, 5000);

  updateNav();
  switchView(currentUser ? homeFor(currentUser) : 'home-view');
});