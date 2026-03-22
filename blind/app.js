// i18n + cycleLang + updateLangCycleBtn are loaded from lang.js

// ==================== Theme system ====================
let currentThemeMode = localStorage.getItem('bs-theme') || 'light';
let currentAccent = localStorage.getItem('bs-accent') || 'sunset';

function initTheme() {
  setTheme(currentThemeMode, true);
  setAccent(currentAccent, true);
}

function toggleTheme() {
  setTheme(currentThemeMode === 'dark' ? 'light' : 'dark');
}

function setTheme(mode, silent) {
  currentThemeMode = mode;
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem('bs-theme', mode);
  document.querySelectorAll('.theme-mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('modeBtn-' + mode);
  if (btn) btn.classList.add('active');
}

function setAccent(name, silent) {
  currentAccent = name;
  document.documentElement.setAttribute('data-accent', name);
  localStorage.setItem('bs-accent', name);
  document.querySelectorAll('.accent-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.accent === name);
  });
}

function toggleSettings() {
  const panel = document.getElementById('settingsPanel');
  const backdrop = document.getElementById('settingsBackdrop');
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  backdrop.classList.toggle('open', !isOpen);
}

initTheme();
i18n.init();

// ==================== API MODULE ====================
const API_URL = 'https://api.rome.markets';

const blindApi = {
  _userId() { return localStorage.getItem('bs-user-id') || ''; },

  async _fetch(path, options = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': this._userId(),
        ...options.headers
      }
    });
    return res.json();
  },

  auth(username) {
    return this._fetch('/api/blind/auth', {
      method: 'POST',
      body: JSON.stringify({ username })
    });
  },

  createSession(pack_key, lang) {
    return this._fetch('/api/blind/sessions', {
      method: 'POST',
      body: JSON.stringify({ pack_key, lang })
    });
  },

  getSession(code) {
    return this._fetch(`/api/blind/sessions/${code}`);
  },

  joinSession(code) {
    return this._fetch(`/api/blind/sessions/${code}/join`, { method: 'POST' });
  },

  submitAnswers(code, answers) {
    return this._fetch(`/api/blind/sessions/${code}/answers`, {
      method: 'POST',
      body: JSON.stringify({ answers })
    });
  },

  getResults(code) {
    return this._fetch(`/api/blind/sessions/${code}/results`);
  },

  getUserSessions() {
    return this._fetch('/api/blind/sessions/user');
  }
};

// ==================== STATE ====================
let currentScreen = 'splash';
let currentQuestion = 0;
let selectedAnswers = {};
let selectedPackKey = 'couples';
let currentUser = JSON.parse(localStorage.getItem('bs-user') || 'null');
let currentSession = null;
let pollTimer = null;
let afterAuthTarget = 'home';
let joinCode = null; // set when joining via URL


// packDefs + questionPacks are loaded from packs.js

// Get current language questions for a pack
function getQuestions(packKey) {
  const lang = i18n.current;
  const pack = questionPacks[lang]?.[packKey] || questionPacks.en[packKey];
  return pack.map(q => ({
    q: q.q,
    options: q.options,
    partnerAnswerIndex: q.pi
  }));
}

let questions = getQuestions('couples');

// ==================== AUTH FLOW ====================
function showAuth(target) {
  afterAuthTarget = target;
  if (currentUser) {
    goTo(afterAuthTarget);
    return;
  }
  goTo('auth');
  setTimeout(() => document.getElementById('authUsername')?.focus(), 300);
}

async function doAuth() {
  const input = document.getElementById('authUsername');
  const err = document.getElementById('authError');
  const btn = document.getElementById('authBtn');
  const username = input.value.trim();

  if (username.length < 2) {
    err.textContent = 'at least 2 characters';
    return;
  }

  btn.disabled = true;
  btn.textContent = '...';
  err.textContent = '';

  try {
    const data = await blindApi.auth(username);
    if (data.error) { err.textContent = data.error; return; }

    currentUser = data.user;
    localStorage.setItem('bs-user', JSON.stringify(currentUser));
    localStorage.setItem('bs-user-id', currentUser.id);

    // If joining via URL code
    if (joinCode) {
      await handleJoinCode(joinCode);
      joinCode = null;
      return;
    }

    goTo(afterAuthTarget);
  } catch (e) {
    err.textContent = 'connection error, try again';
  } finally {
    btn.disabled = false;
    btn.textContent = 'continue';
  }
}

// Enter key on auth input
document.getElementById('authUsername')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') doAuth();
});

function switchUser() {
  currentUser = null;
  currentSession = null;
  localStorage.removeItem('bs-user');
  localStorage.removeItem('bs-user-id');
  stopPolling();
  document.getElementById('authUsername').value = '';
  document.getElementById('authError').textContent = '';
  afterAuthTarget = 'home';
  goTo('auth');
  setTimeout(() => document.getElementById('authUsername')?.focus(), 300);
}

// ==================== HOME SESSIONS ====================
let _cachedSessions = null;
let _homeFilter = 'all';

function setHomeFilter(filter) {
  _homeFilter = filter;
  document.querySelectorAll('.home-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderHomeSessions();
}

function renderHomeSessions() {
  const container = document.getElementById('homeSessions');
  if (!container) return;
  if (_cachedSessions === null) {
    container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-dim)">${i18n.t('home_loading')}</div>`;
    return;
  }
  const hidden = getHiddenSessions();
  const sessions = _cachedSessions.filter(s => !hidden.includes(s.code));

  if (sessions.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--text-dim)">
        <div style="font-size:36px;margin-bottom:12px">🫣</div>
        <p>${i18n.t('home_no_sessions')}</p>
      </div>`;
    return;
  }

  const packEmojis = { couples: '💕', bestfriends: '👯', deeptalk: '🌊', coworkers: '💼', '36questions': '❤️‍🔥', hottakes: '🌶️', redflags: '🚩', chaotic: '🎲', fungames: '🎉', worldtaste: '🌍', ethics: '⚖️', situations: '😱', livingtogether: '🏠', soulspirit: '🕊️' };
  let html = '';
  const active = sessions.filter(s => s.status !== 'complete');
  const done = sessions.filter(s => s.status === 'complete');

  const showActive = _homeFilter === 'all' || _homeFilter === 'active';
  const showDone = _homeFilter === 'all' || _homeFilter === 'completed';

  if (showActive && active.length) {
    if (_homeFilter === 'all') html += `<div class="section-label">${i18n.t('home_active')}</div>`;
    active.forEach(s => {
      const partner = s.creator_id === currentUser.id ? s.partner_username : s.creator_username;
      const emoji = packEmojis[s.pack_key] || '📦';
      const packName = i18n.t('pack_' + s.pack_key) || s.pack_key;
      let badge = '';
      if (s.status === 'waiting') badge = `<div class="s-badge badge-waiting">${i18n.t('badge_waiting')}</div>`;
      else if (s.status === 'active') badge = `<div class="s-badge badge-progress">${i18n.t('badge_progress')}</div>`;

      html += `<div class="session-card-wrap" data-code="${s.code}">
        <div class="session-card glass" onclick="resumeSession('${s.code}')">
          <div class="s-icon" style="background:rgba(124,58,237,0.1)">${emoji}</div>
          <div class="s-info">
            <div class="s-title">${packName}</div>
            <div class="s-sub">${partner ? i18n.t('home_with') + ' ' + partner : i18n.t('home_waiting_partner')} · ${s.code}</div>
          </div>
          ${badge}
        </div>
        <button class="delete-btn" onclick="openDeleteModal('${s.code}')">${i18n.t('delete_label')}</button>
      </div>`;
    });
  }

  if (showDone && done.length) {
    if (_homeFilter === 'all') html += `<div class="section-label">${i18n.t('home_completed')}</div>`;
    done.forEach(s => {
      const partner = s.creator_id === currentUser.id ? s.partner_username : s.creator_username;
      const emoji = packEmojis[s.pack_key] || '📦';
      const packName = i18n.t('pack_' + s.pack_key) || s.pack_key;
      html += `<div class="session-card-wrap" data-code="${s.code}">
        <div class="session-card glass" onclick="viewResults('${s.code}')">
          <div class="s-icon" style="background:var(--surface)">${emoji}</div>
          <div class="s-info">
            <div class="s-title">${packName}</div>
            <div class="s-sub">${i18n.t('home_with')} ${partner || '?'}</div>
          </div>
          <div class="s-badge badge-done">${i18n.t('home_done')}</div>
        </div>
        <button class="delete-btn" onclick="openDeleteModal('${s.code}')">${i18n.t('delete_label')}</button>
      </div>`;
    });
  }

  if (!html) {
    const emptyKey = _homeFilter === 'active' ? 'home_active' : _homeFilter === 'completed' ? 'home_completed' : '';
    html = `<div style="text-align:center;padding:40px 20px;color:var(--text-dim)">
      <div style="font-size:36px;margin-bottom:12px">🫣</div>
      <p>${i18n.t('home_no_sessions')}</p>
    </div>`;
  }

  container.innerHTML = html;
  initSwipeToDelete();
}

async function loadHomeSessions() {
  const usernameEl = document.getElementById('homeUsername');
  if (currentUser) usernameEl.textContent = '@' + currentUser.username;
  if (_cachedSessions === null) renderHomeSessions();
  try {
    const data = await blindApi.getUserSessions();
    _cachedSessions = data.sessions || [];
    renderHomeSessions();
  } catch (e) {
    const container = document.getElementById('homeSessions');
    if (container) container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-dim)">${i18n.t('home_load_error')}</div>`;
  }
}

async function resumeSession(code) {
  try {
    const data = await blindApi.getSession(code);
    const s = data.session;
    currentSession = s;
    selectedPackKey = s.pack_key;
    questions = getQuestions(s.pack_key);

    if (s.status === 'complete') {
      viewResults(code);
      return;
    }

    if (s.user_submitted) {
      // Already submitted, go to waiting
      goTo('waiting');
      document.getElementById('waitingCode').textContent = s.code;
      const pName = s.creator_id === currentUser?.id ? s.partner_username : s.creator_username;
      if (pName) {
        document.getElementById('waitingDesc').innerHTML =
          `waiting for <strong style="color:var(--text)">${pName}</strong> to finish answering...`;
      }
      startPolling();
      return;
    }

    // Start/continue quiz
    currentQuestion = 0;
    selectedAnswers = {};
    questionModes = [];
    goTo('quiz');
  } catch (e) {
    alert('Could not load session');
  }
}

async function viewResults(code) {
  try {
    currentSession = (await blindApi.getSession(code)).session;
    selectedPackKey = currentSession.pack_key;
    questions = getQuestions(currentSession.pack_key);
    goTo('results');
    await buildReceiptFromApi(code);
  } catch (e) {
    alert('Could not load results');
  }
}

// ==================== SESSION CREATION ====================
function getInviteUrl() {
  if (!currentSession) return '';
  const base = window.location.origin + window.location.pathname;
  return base + '?join=' + currentSession.code;
}

function copyInviteLink(btn) {
  const url = getInviteUrl();
  navigator.clipboard.writeText(url).catch(() => {});
  const orig = btn.textContent;
  btn.textContent = 'copied!';
  btn.style.background = 'var(--lime)';
  btn.style.color = '#000';
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.background = '';
    btn.style.color = '';
  }, 2000);
}

function shareInvite(method) {
  const url = getInviteUrl();
  const text = 'take this blind quiz with me!';
  if (method === 'share' && navigator.share) {
    navigator.share({ title: 'blindside.', text, url }).catch(() => {});
  } else if (method === 'whatsapp') {
    window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url));
  } else if (method === 'sms') {
    window.open('sms:?body=' + encodeURIComponent(text + ' ' + url));
  }
}

// ==================== JOIN VIA URL ====================
async function handleJoinCode(code) {
  try {
    // First check session status
    const check = await blindApi.getSession(code);
    if (check.error) { alert('Session not found'); goTo('home'); return; }

    const session = check.session;

    // If already complete, just show results
    if (session.status === 'complete') {
      viewResults(code);
      return;
    }

    // If user already submitted for this session, go to waiting
    if (session.user_submitted) {
      currentSession = session;
      selectedPackKey = session.pack_key;
      questions = getQuestions(session.pack_key);
      goTo('waiting');
      document.getElementById('waitingCode').textContent = session.code;
      const pName = session.creator_id === currentUser?.id ? session.partner_username : session.creator_username;
      if (pName) {
        document.getElementById('waitingDesc').innerHTML =
          `waiting for <strong style="color:var(--text)">${pName}</strong> to finish answering...`;
      }
      startPolling();
      return;
    }

    // Join the session
    const data = await blindApi.joinSession(code);
    if (data.error) { alert(data.error); goTo('home'); return; }

    currentSession = data.session;
    selectedPackKey = currentSession.pack_key;
    questions = getQuestions(currentSession.pack_key);

    currentQuestion = 0;
    selectedAnswers = {};
    questionModes = [];
    goTo('quiz');
  } catch (e) {
    alert('Could not join session');
    goTo('home');
  }
}

// Render marquee
function renderPacksMarquee() {
  const el = document.getElementById('packsMarquee');
  if (!el) return;
  const items = [
    `<span class="marquee-hot">${i18n.t('marquee_trending')}</span>`,
    `<span>${i18n.t('marquee_plays')}</span>`,
    `<span class="marquee-hot">${i18n.t('marquee_new')}</span>`,
    `<span>${i18n.t('marquee_dare')}</span>`,
    `<span class="marquee-hot">${i18n.t('marquee_viral')}</span>`,
    `<span>${i18n.t('marquee_send')}</span>`,
  ];
  el.innerHTML = items.join('') + items.join('');
}

// Render filter pills
function renderPacksFilters() {
  const el = document.getElementById('packsFilters');
  if (!el) return;
  el.innerHTML = packCategories.map(c =>
    `<button class="filter-pill${c.key === activePackFilter ? ' active' : ''}" onclick="filterPacks('${c.key}')">${c.icon ? c.icon + ' ' : ''}${i18n.t(c.labelKey)}</button>`
  ).join('');
}

function filterPacks(catKey) {
  activePackFilter = catKey;
  renderPacksFilters();
  renderPacksGridCards();
  const featuredSection = document.getElementById('packsFeaturedSection');
  const sectionLabel = document.querySelector('.packs-section-label');
  if (featuredSection) featuredSection.style.display = catKey === 'all' ? '' : 'none';
  if (sectionLabel) sectionLabel.style.display = catKey === 'all' ? '' : 'none';
}

// Render featured carousel
function renderPacksFeatured() {
  const el = document.getElementById('packsFeatured');
  if (!el) return;
  const featured = packDefs.filter(p => p.featured);
  el.innerHTML = featured.map((p, idx) =>
    `<div class="featured-card" style="animation-delay:${idx * 0.1}s" onclick="selectPack('${p.key}')">
      <div class="featured-badge ${p.featuredBadge}">${i18n.t('badge_' + p.featuredBadge)}</div>
      <div class="featured-emoji">${p.emoji}</div>
      <div class="featured-title">${i18n.t(p.nameKey)}</div>
      <div class="featured-desc">${i18n.t(p.descKey)}</div>
      <div class="featured-meta">
        <span class="meta-plays">${p.plays} ${i18n.t('packs_played')}</span>
      </div>
    </div>`
  ).join('');
}

// Render pack grid cards
function renderPacksGridCards() {
  const grid = document.getElementById('packsGrid');
  if (!grid) return;
  const filtered = activePackFilter === 'all'
    ? packDefs
    : packDefs.filter(p => p.cat === activePackFilter);
  grid.innerHTML = filtered.map((p, idx) => {
    const badgeHtml = p.badge
      ? `<span class="pack-badge badge-${p.badge}">${i18n.t('badge_' + p.badge)}</span>`
      : '';
    return `<div class="pack-card glass" style="animation-delay:${idx * 0.06}s" onclick="selectPack('${p.key}')">
      ${badgeHtml}
      <div class="pack-emoji">${p.emoji}</div>
      <div class="pack-title">${i18n.t(p.nameKey)}</div>
      <div class="pack-plays">${p.plays} ${i18n.t('packs_played')}</div>
      <div class="pack-count">${i18n.t(p.countKey)}</div>
    </div>`;
  }).join('');
}

// Full packs render
function renderPacksGrid() {
  renderPacksMarquee();
  renderPacksFilters();
  renderPacksFeatured();
  renderPacksGridCards();
}
renderPacksGrid();

// Navigation
function goTo(screenId) {
  const prev = document.getElementById(currentScreen);
  const next = document.getElementById(screenId);
  if (!next) return;
  if (currentScreen === screenId) {
    // Allow re-triggering side effects for home
    if (screenId === 'home') { stopPolling(); loadHomeSessions(); }
    return;
  }

  prev.classList.remove('active');
  prev.classList.add('slide-out');

  setTimeout(() => {
    prev.classList.remove('slide-out');
    next.classList.add('active');
    currentScreen = screenId;

    if (screenId === 'quiz') renderQuestion();
    if (screenId === 'results') { /* receipt built by caller */ }
    if (screenId === 'home') { updateNav('home'); stopPolling(); loadHomeSessions(); }
    if (screenId === 'packs') { updateNav('packs'); renderPacksGrid(); }
  }, 200);
}

function updateNav(active) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  // This is cosmetic
}

// Pack selection
async function selectPack(key) {
  selectedPackKey = key;
  const def = packDefs.find(p => p.key === key);
  questions = getQuestions(key);
  document.getElementById('invitePackName').textContent = i18n.t(def.nameKey);

  // Create session via API
  try {
    const data = await blindApi.createSession(key, i18n.current);
    if (data.error) { alert(data.error); return; }
    currentSession = data.session;
    document.getElementById('inviteLink').textContent = getInviteUrl();
    goTo('invite');
  } catch (e) {
    alert('Could not create session');
  }
}

function startQuizAsCreator() {
  currentQuestion = 0;
  selectedAnswers = {};
  questionModes = [];
  goTo('quiz');
}

// Quiz — Mini-game modes
const QUIZ_MODES = ['classic', 'thisOrThat', 'bubblePop', 'blitz', 'swipe'];
const MODE_LABELS = { classic: '✏️', thisOrThat: '⚔️ This or That', bubblePop: '🫧 Bubble Pop', blitz: '⚡ Blitz', swipe: '👆 Swipe Pick' };
let questionModes = [];
let blitzInterval = null;

function assignQuestionModes() {
  questionModes = [];
  for (let i = 0; i < questions.length; i++) {
    if (i === 0) { questionModes.push('classic'); continue; }
    const av = QUIZ_MODES.filter(m => m !== questionModes[i - 1]);
    questionModes.push(av[Math.floor(Math.random() * av.length)]);
  }
}

function renderQuestion() {
  if (!questionModes.length) assignQuestionModes();
  const q = questions[currentQuestion];
  const total = questions.length;
  const progress = ((currentQuestion) / total) * 100;
  const mode = questionModes[currentQuestion];

  document.getElementById('quizProgress').style.width = progress + '%';
  document.getElementById('quizCount').textContent = `${currentQuestion + 1} / ${total}`;

  const isLast = currentQuestion === total - 1;
  const nextBtn = document.getElementById('quizNextBtn');
  nextBtn.textContent = isLast ? i18n.t('quiz_submit') : i18n.t('quiz_next');
  nextBtn.disabled = selectedAnswers[currentQuestion] === undefined;
  document.getElementById('quizBackBtn').style.display = currentQuestion > 0 ? '' : 'none';

  if (blitzInterval) { clearInterval(blitzInterval); blitzInterval = null; }
  const body = document.getElementById('quizBody');

  switch (mode) {
    case 'thisOrThat': renderThisOrThat(body, q); break;
    case 'bubblePop': renderBubblePop(body, q); break;
    case 'blitz': renderBlitz(body, q); break;
    case 'swipe': renderSwipe(body, q); break;
    default: renderClassic(body, q);
  }
}

// --- CLASSIC ---
function renderClassic(body, q) {
  body.innerHTML = `
    <div class="question-card" key="${currentQuestion}">
      <div class="question-label">${i18n.t('quiz_question')} ${currentQuestion + 1}</div>
      <div class="question-text">${q.q}</div>
      <div class="answer-options">
        ${q.options.map((opt, oi) => `
          <button class="answer-opt ${selectedAnswers[currentQuestion] === oi ? 'selected' : ''}"
                  onclick="selectAnswer(${currentQuestion}, ${oi}, this)">
            ${opt}
          </button>
        `).join('')}
      </div>
    </div>`;
}

// --- THIS OR THAT ---
function renderThisOrThat(body, q) {
  const opts = q.options, s = selectedAnswers[currentQuestion];
  body.innerHTML = `
    <div class="question-card" key="${currentQuestion}">
      <div class="mode-badge">${MODE_LABELS.thisOrThat}</div>
      <div class="question-text" style="font-size:19px">${q.q}</div>
      <div class="tot-container">
        <div class="tot-matchup">
          ${opts.slice(0, 2).map((opt, i) =>
            `<div class="tot-side ${s === i ? 'selected' : (s !== undefined && s !== i ? 'dimmed' : '')}"
                  onclick="selectTot(${currentQuestion}, ${i})">${opt}</div>`
          ).join('<div class="tot-vs">VS</div>')}
        </div>
        <div class="tot-matchup">
          ${opts.slice(2).map((opt, i) =>
            `<div class="tot-side ${s === (i+2) ? 'selected' : (s !== undefined && s !== (i+2) ? 'dimmed' : '')}"
                  onclick="selectTot(${currentQuestion}, ${i+2})">${opt}</div>`
          ).join('<div class="tot-vs">VS</div>')}
        </div>
      </div>
    </div>`;
}
function selectTot(qi, ans) {
  selectedAnswers[qi] = ans;
  document.getElementById('quizNextBtn').disabled = false;
  document.querySelectorAll('.tot-side').forEach((el, i) => {
    el.classList.remove('selected', 'dimmed');
    if (i === ans) el.classList.add('selected');
    else el.classList.add('dimmed');
  });
}

// --- BUBBLE POP ---
function renderBubblePop(body, q) {
  const pos = [
    { top: '5%', left: '8%', size: 120 },
    { top: '2%', left: '55%', size: 110 },
    { top: '50%', left: '5%', size: 115 },
    { top: '48%', left: '52%', size: 125 }
  ];
  const s = selectedAnswers[currentQuestion];
  body.innerHTML = `
    <div class="question-card" key="${currentQuestion}">
      <div class="mode-badge">${MODE_LABELS.bubblePop}</div>
      <div class="question-text" style="font-size:19px">${q.q}</div>
      <div class="bubble-field">
        ${q.options.map((opt, oi) => {
          const p = pos[oi];
          return `<div class="bubble ${s === oi ? 'selected' : ''} ${s !== undefined && s !== oi ? 'dimmed' : ''}"
                       style="top:${p.top};left:${p.left};width:${p.size}px;height:${p.size}px"
                       onclick="selectBubble(${currentQuestion}, ${oi})">${opt}</div>`;
        }).join('')}
      </div>
    </div>`;
}
function selectBubble(qi, ans) {
  selectedAnswers[qi] = ans;
  document.getElementById('quizNextBtn').disabled = false;
  document.querySelectorAll('.bubble').forEach((el, i) => {
    el.classList.remove('selected', 'dimmed');
    if (i === ans) el.classList.add('selected');
    else el.classList.add('dimmed');
  });
}

// --- BLITZ ---
function renderBlitz(body, q) {
  const BT = 10;
  body.innerHTML = `
    <div class="question-card" key="${currentQuestion}">
      <div class="mode-badge">${MODE_LABELS.blitz}</div>
      <div class="blitz-label" id="blitzCount">${BT}</div>
      <div class="blitz-timer-bar"><div class="blitz-timer-fill" id="blitzFill"></div></div>
      <div class="question-text" style="font-size:19px">${q.q}</div>
      <div class="answer-options blitz-mode">
        ${q.options.map((opt, oi) => `
          <button class="answer-opt ${selectedAnswers[currentQuestion] === oi ? 'selected' : ''}"
                  onclick="selectAnswer(${currentQuestion}, ${oi}, this)">
            ${opt}
          </button>
        `).join('')}
      </div>
    </div>`;
  if (selectedAnswers[currentQuestion] !== undefined) return;
  let rem = BT * 10;
  const fill = document.getElementById('blitzFill'), label = document.getElementById('blitzCount');
  blitzInterval = setInterval(() => {
    rem--;
    const pct = (rem / (BT * 10)) * 100;
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = Math.ceil(rem / 10);
    if (rem <= 30) {
      if (fill) fill.classList.add('urgent');
      if (label) label.classList.add('urgent');
    }
    if (rem <= 0) {
      clearInterval(blitzInterval); blitzInterval = null;
      if (selectedAnswers[currentQuestion] === undefined) {
        const ri = Math.floor(Math.random() * q.options.length);
        selectedAnswers[currentQuestion] = ri;
        document.getElementById('quizNextBtn').disabled = false;
        const btns = document.querySelectorAll('.blitz-mode .answer-opt');
        if (btns[ri]) btns[ri].classList.add('selected');
        if (label) { label.textContent = '\u23F0'; label.style.fontSize = '36px'; }
      }
    }
  }, 100);
}

// --- SWIPE ---
let swipeDeckData = [];
function renderSwipe(body, q) {
  swipeDeckData = q.options.map((opt, i) => ({ text: opt, index: i }));
  const prev = selectedAnswers[currentQuestion];
  body.innerHTML = `
    <div class="question-card" key="${currentQuestion}">
      <div class="mode-badge">${MODE_LABELS.swipe}</div>
      <div class="question-text" style="font-size:19px">${q.q}</div>
      <div class="swipe-deck" id="swipeDeck"></div>
      <div class="swipe-hint">\u2190 skip \u00B7 swipe right to pick \u2192</div>
    </div>`;
  const deck = document.getElementById('swipeDeck');
  for (let i = swipeDeckData.length - 1; i >= 0; i--) {
    const card = document.createElement('div');
    card.className = 'swipe-card';
    card.textContent = swipeDeckData[i].text;
    card.style.zIndex = swipeDeckData.length - i;
    const d = swipeDeckData.length - 1 - i;
    card.style.transform = `scale(${1 - d * 0.04}) translateY(${d * 6}px)`;
    card.dataset.optIndex = i;
    deck.appendChild(card);
  }
  if (prev !== undefined) {
    deck.innerHTML = `<div class="swipe-card" style="border-color:var(--accent-1);box-shadow:0 0 24px var(--accent-1-glow)">${q.options[prev]}</div>`;
    return;
  }
  initSwipeDeckGestures(deck);
}

function initSwipeDeckGestures(deck) {
  const cards = Array.from(deck.querySelectorAll('.swipe-card'));
  let topIdx = 0;
  function attachSwipe(card) {
    let startX = 0, dx = 0, dragging = false;
    const onStart = (e) => {
      const pt = e.touches ? e.touches[0] : e;
      startX = pt.clientX; dragging = true;
      card.style.transition = 'none';
    };
    const onMove = (e) => {
      if (!dragging) return;
      const pt = e.touches ? e.touches[0] : e;
      dx = pt.clientX - startX;
      card.style.transform = `translateX(${dx}px) rotate(${dx * 0.08}deg)`;
      if (!card.querySelector('.pick-indicator')) {
        card.insertAdjacentHTML('afterbegin',
          '<div class="swipe-indicator pick pick-indicator">PICK</div><div class="swipe-indicator nope nope-indicator">SKIP</div>');
      }
      const pi = card.querySelector('.pick-indicator'), ni = card.querySelector('.nope-indicator');
      if (pi) pi.style.opacity = Math.max(0, Math.min(1, dx / 80));
      if (ni) ni.style.opacity = Math.max(0, Math.min(1, -dx / 80));
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      if (dx > 70) {
        card.style.transform = 'translateX(400px) rotate(20deg)';
        card.style.opacity = '0';
        const oi = parseInt(card.dataset.optIndex);
        selectedAnswers[currentQuestion] = oi;
        document.getElementById('quizNextBtn').disabled = false;
        setTimeout(() => {
          deck.innerHTML = `<div class="swipe-card" style="border-color:var(--accent-1);box-shadow:0 0 24px var(--accent-1-glow);opacity:0;animation:cardIn 0.3s ease forwards">${swipeDeckData[oi].text}</div>`;
        }, 250);
      } else if (dx < -70) {
        card.style.transform = 'translateX(-400px) rotate(-20deg)';
        card.style.opacity = '0';
        topIdx++;
        if (topIdx >= cards.length) {
          topIdx = 0;
          setTimeout(() => { renderSwipe(document.getElementById('quizBody'), questions[currentQuestion]); }, 300);
        }
      } else {
        card.style.transform = '';
        const pi = card.querySelector('.pick-indicator'), ni = card.querySelector('.nope-indicator');
        if (pi) pi.style.opacity = '0';
        if (ni) ni.style.opacity = '0';
      }
      dx = 0;
    };
    card.addEventListener('touchstart', onStart, { passive: true });
    card.addEventListener('touchmove', onMove, { passive: true });
    card.addEventListener('touchend', onEnd);
    card.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  }
  cards.forEach(c => attachSwipe(c));
}

function selectAnswer(qIndex, answer, el) {
  selectedAnswers[qIndex] = answer;
  if (el && el.parentElement) {
    el.parentElement.querySelectorAll('.answer-opt').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
  }
  document.getElementById('quizNextBtn').disabled = false;
  if (blitzInterval) { clearInterval(blitzInterval); blitzInterval = null; }
}

function nextQuestion() {
  if (selectedAnswers[currentQuestion] === undefined) return;

  if (currentQuestion === questions.length - 1) {
    document.getElementById('submitModal').classList.add('show');
    return;
  }

  currentQuestion++;
  renderQuestion();
}

function prevQuestion() {
  if (currentQuestion > 0) {
    currentQuestion--;
    renderQuestion();
  }
}

function confirmQuit() {
  goTo('home');
}

function closeModal() {
  document.getElementById('submitModal').classList.remove('show');
}

// Session delete
let pendingDeleteCode = null;

function initSwipeToDelete() {
  document.querySelectorAll('.session-card-wrap').forEach(wrap => {
    const card = wrap.querySelector('.session-card');
    let startX = 0, currentX = 0, dragging = false;

    card.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      currentX = startX;
      dragging = true;
      card.style.transition = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      if (!dragging) return;
      currentX = e.touches[0].clientX;
      const dx = Math.min(0, currentX - startX);
      if (dx < -10) {
        card.style.transform = `translateX(${Math.max(dx, -80)}px)`;
      }
    }, { passive: true });

    card.addEventListener('touchend', () => {
      dragging = false;
      card.style.transition = '';
      const dx = currentX - startX;
      if (dx < -40) {
        wrap.classList.add('swiped');
        card.style.transform = '';
        closeSiblingSwipes(wrap);
      } else {
        wrap.classList.remove('swiped');
        card.style.transform = '';
      }
    });
  });

  // Click outside to close any swiped card
  document.addEventListener('click', e => {
    if (!e.target.closest('.session-card-wrap')) {
      document.querySelectorAll('.session-card-wrap.swiped').forEach(w => w.classList.remove('swiped'));
    }
  });
}

function closeSiblingSwipes(except) {
  document.querySelectorAll('.session-card-wrap.swiped').forEach(w => {
    if (w !== except) w.classList.remove('swiped');
  });
}

function openDeleteModal(code) {
  pendingDeleteCode = code;
  document.getElementById('deleteModal').classList.add('show');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('show');
  pendingDeleteCode = null;
}

function getHiddenSessions() {
  try { return JSON.parse(localStorage.getItem('bs-hidden-sessions') || '[]'); } catch { return []; }
}

function hideSession(code) {
  const hidden = getHiddenSessions();
  if (!hidden.includes(code)) {
    hidden.push(code);
    localStorage.setItem('bs-hidden-sessions', JSON.stringify(hidden));
  }
}

function confirmDeleteSession() {
  if (!pendingDeleteCode) return;
  const code = pendingDeleteCode;
  closeDeleteModal();

  // Persist in localStorage
  hideSession(code);

  const wrap = document.querySelector(`.session-card-wrap[data-code="${code}"]`);
  if (wrap) {
    wrap.classList.add('removing');
    wrap.addEventListener('animationend', () => wrap.remove());
  }

  // Remove from cached sessions
  if (_cachedSessions) {
    _cachedSessions = _cachedSessions.filter(s => s.code !== code);
  }

  // Re-render if all sessions removed
  if (_cachedSessions && _cachedSessions.length === 0) {
    renderHomeSessions();
  }
}

async function submitAnswers() {
  closeModal();
  document.getElementById('quizProgress').style.width = '100%';

  if (currentSession) {
    try {
      const data = await blindApi.submitAnswers(currentSession.code, selectedAnswers);
      if (data.error) {
        alert('Failed to submit: ' + data.error);
        return;
      }
      if (data.both_done) {
        goTo('reveal');
        runCountdown();
        return;
      }
    } catch (e) {
      alert('Could not submit answers. Check your connection and try again.');
      return;
    }
  }

  // Go to waiting screen
  goTo('waiting');
  if (currentSession) {
    document.getElementById('waitingCode').textContent = currentSession.code;
    const partner = currentSession.creator_id === currentUser?.id
      ? currentSession.partner_username
      : currentSession.creator_username;
    document.getElementById('waitingDesc').innerHTML = partner
      ? `waiting for <strong style="color:var(--text)">${partner}</strong> to finish answering...`
      : 'waiting for your partner to join and answer...';
    startPolling();
  }
}

function startPolling() {
  stopPolling();
  document.getElementById('waitingStatus').textContent = 'checking...';

  pollTimer = setInterval(async () => {
    if (!currentSession) return;
    try {
      const data = await blindApi.getSession(currentSession.code);
      const s = data.session;
      currentSession = s;

      if (s.status === 'complete' || (s.user_submitted && s.partner_submitted)) {
        stopPolling();
        document.getElementById('waitingStatus').textContent = 'both done!';
        setTimeout(() => {
          goTo('reveal');
          runCountdown();
        }, 500);
      } else if (s.partner_submitted) {
        document.getElementById('waitingStatus').textContent = 'partner is done! waiting for you...';
      } else if (s.partner_id) {
        const pName = s.creator_id === currentUser?.id ? s.partner_username : s.creator_username;
        document.getElementById('waitingStatus').textContent = (pName || 'partner') + ' is answering...';
        document.getElementById('waitingDesc').innerHTML =
          `waiting for <strong style="color:var(--text)">${pName || 'partner'}</strong> to finish answering...`;
      } else {
        document.getElementById('waitingStatus').textContent = 'waiting for partner to join...';
      }
    } catch (e) { /* silent */ }
  }, 3000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// Reveal
function startReveal() {
  goTo('reveal');
  runCountdown();
}

function runCountdown() {
  const container = document.getElementById('revealCountdown');
  let count = 3;
  container.classList.remove('hidden');

  function showNum() {
    if (count > 0) {
      container.innerHTML = `
        <div class="countdown-num" key="${count}">${count}</div>
        <div class="countdown-label">${i18n.t('reveal_get_ready')}</div>
      `;
      count--;
      setTimeout(showNum, 800);
    } else {
      // Skip per-card reveal, go straight to receipt
      if (currentSession) {
        goTo('results');
        buildReceiptFromApi(currentSession.code);
      } else {
        goTo('results');
        buildReceipt();
      }
    }
  }
  showNum();
}

// Per-question reveal flow
let revealIndex = 0;
let revealData = [];

const matchReactions = [
  { emoji: '🔥', text: 'same wavelength!' },
  { emoji: '🧠', text: 'telepathic!' },
  { emoji: '💫', text: 'in sync!' },
  { emoji: '🎯', text: 'bullseye!' },
  { emoji: '⚡', text: 'connected!' },
];
const diffReactions = [
  { emoji: '👀', text: 'plot twist' },
  { emoji: '😏', text: 'interesting...' },
  { emoji: '🌀', text: 'different worlds' },
  { emoji: '🤷', text: 'agree to disagree' },
  { emoji: '💭', text: 'now you know' },
];

function showRevealCards() {
  revealIndex = 0;
  revealData = questions.map((q, i) => {
    const userIdx = selectedAnswers[i] != null ? selectedAnswers[i] : 0;
    const partnerIdx = q.partnerAnswerIndex;
    return { q: q.q, userAns: q.options[userIdx], partnerAns: q.options[partnerIdx], matched: userIdx === partnerIdx };
  });
  showRevealCard(0);
}

function showRevealCard(idx) {
  if (idx >= revealData.length) {
    goTo('results');
    setTimeout(buildReceipt, 300);
    return;
  }

  const container = document.getElementById('revealCardsContainer');
  const d = revealData[idx];
  const reaction = d.matched
    ? matchReactions[idx % matchReactions.length]
    : diffReactions[idx % diffReactions.length];

  // Remove old card
  const old = container.querySelector('.reveal-fullscreen.active');
  if (old) {
    old.classList.remove('active');
    old.classList.add('exit');
    setTimeout(() => old.remove(), 400);
  }

  const card = document.createElement('div');
  card.className = 'reveal-fullscreen';
  card.innerHTML = `
    <div class="reveal-q-num">${i18n.t('reveal_question_of').replace('{n}', idx + 1).replace('{total}', revealData.length)}</div>
    <div class="reveal-question">${d.q}</div>
    <div class="reveal-vs-block">
      <div class="reveal-vs-card you-card">
        <div class="rv-label">${i18n.t('reveal_you')}</div>
        <div class="rv-answer rv-answer-hidden" id="revYou${idx}">• • •</div>
      </div>
      <div class="reveal-vs-card them-card">
        <div class="rv-label">Alex</div>
        <div class="rv-answer rv-answer-hidden" id="revThem${idx}">• • •</div>
      </div>
    </div>
    <div class="reveal-reaction" id="revReaction${idx}">
      <span class="reaction-emoji">${reaction.emoji}</span>
      <div class="reaction-text ${d.matched ? 'matched-text' : 'diff-text'}">${reaction.text}</div>
    </div>
    <div class="reveal-tap-hint" id="revHint${idx}">${i18n.t('reveal_tap_reveal')}</div>
    ${d.matched ? '<div class="card-confetti" id="revConfetti' + idx + '"></div>' : ''}
  `;
  container.appendChild(card);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => card.classList.add('active'));
  });

  let tapState = 0; // 0=show answers, 1=next
  card.onclick = () => {
    if (tapState === 0) {
      // Reveal answers
      const youEl = document.getElementById(`revYou${idx}`);
      const themEl = document.getElementById(`revThem${idx}`);
      const hintEl = document.getElementById(`revHint${idx}`);
      youEl.textContent = d.userAns;
      youEl.classList.remove('rv-answer-hidden');
      themEl.textContent = d.partnerAns;
      themEl.classList.remove('rv-answer-hidden');
      youEl.style.animation = 'countPop 0.35s ease';
      themEl.style.animation = 'countPop 0.35s ease 0.1s both';

      // Show reaction
      setTimeout(() => {
        const reactionEl = document.getElementById(`revReaction${idx}`);
        if (reactionEl) reactionEl.classList.add('pop');
        if (d.matched) {
          burstCardConfetti(`revConfetti${idx}`);
        }
      }, 300);

      hintEl.textContent = i18n.t('reveal_tap_continue');
      tapState = 1;
    } else {
      revealIndex++;
      showRevealCard(revealIndex);
    }
  };
}

function burstCardConfetti(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const colors = ['#7C3AED', '#EC4899', '#84CC16', '#F97316', '#06B6D4'];
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div');
    p.className = 'card-confetti-piece';
    const size = 4 + Math.random() * 5;
    const angle = (Math.PI * 2 * i) / 24;
    const dist = 60 + Math.random() * 80;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    p.style.cssText = `
      width:${size}px;height:${size}px;
      background:${colors[i % colors.length]};
      left:50%;top:50%;
      transform:translate(-50%,-50%);
      animation: cardConfettiBurst 0.8s ease-out forwards;
    `;
    // Override animation with custom end position
    p.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`, opacity: 0 }
    ], { duration: 600 + Math.random() * 400, easing: 'cubic-bezier(0,0.5,0.5,1)', fill: 'forwards' });
    el.appendChild(p);
  }
}

// Confetti
function spawnConfetti() {
  const container = document.getElementById('confetti');
  const colors = ['#7C3AED', '#EC4899', '#84CC16', '#F97316', '#06B6D4', '#fff'];

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (1.5 + Math.random() * 2) + 's';
    piece.style.animationDelay = Math.random() * 0.5 + 's';
    piece.style.width = (5 + Math.random() * 6) + 'px';
    piece.style.height = (8 + Math.random() * 10) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(piece);
  }
  setTimeout(() => { container.innerHTML = ''; }, 4000);
}

// Vibe Receipt builder

// ==================== AI VIBE REPORT ====================
function getVibeReportLoadingHtml() {
  return `
    <div class="vibe-report">
      <div class="vibe-report-inner vibe-report-loading">
        <div class="vibe-skel vibe-skel-badge"></div>
        <div class="vibe-skel vibe-skel-title"></div>
        <div class="vibe-skel vibe-skel-line"></div>
        <div class="vibe-skel vibe-skel-line"></div>
        <div class="vibe-skel vibe-skel-line short"></div>
        <div style="height:12px"></div>
        <div class="vibe-skel vibe-skel-award"></div>
        <div class="vibe-skel vibe-skel-award"></div>
        <div class="vibe-skel vibe-skel-award"></div>
        <div style="height:12px"></div>
        <div class="vibe-skel vibe-skel-metaphor"></div>
        <div class="vibe-loading-hint">ai is reading your vibes...</div>
      </div>
    </div>
  `;
}

function renderVibeReport(report) {
  const awardsHtml = (report.superlatives || []).map(s => `
    <div class="vibe-award">
      <div class="vibe-award-icon">${s.icon}</div>
      <div class="vibe-award-content">
        <div class="vibe-award-label">${s.label}</div>
        <div class="vibe-award-text">${s.text}</div>
      </div>
    </div>
  `).join('');

  return `
    <div class="vibe-report" id="vibeReportCard">
      <div class="vibe-report-inner">
        <div class="vibe-report-badge">AI Vibe Report</div>
        <div class="vibe-report-headline">${report.headline}</div>
        <div class="vibe-report-narrative">${report.narrative}</div>
        <div class="vibe-superlatives">${awardsHtml}</div>
        <div class="vibe-metaphor">
          <div class="vibe-metaphor-label">${report.metaphor_label || 'Your Duo Archetype'}</div>
          <div class="vibe-metaphor-text">${report.metaphor}</div>
          <div class="vibe-metaphor-desc">${report.metaphor_desc}</div>
        </div>
      </div>
    </div>
  `;
}

async function generateVibeReport(data, partnerName, pct, packKey) {
  const lang = localStorage.getItem('bs-lang') || 'en';
  const langNames = { en: 'English', tr: 'Turkish', es: 'Spanish', th: 'Thai' };

  const qaList = data.map((d, i) =>
    `Q${i+1}: "${d.q}" — You: "${d.userAns}", ${partnerName}: "${d.partnerAns}" [${d.matched ? 'MATCH' : 'DIFFERENT'}]`
  ).join('\n');

  const prompt = `You are a witty, warm, Gen-Z-friendly personality analyst for a blind compatibility quiz app called "blindside."

Two people answered the same questions without seeing each other's answers. Here are the results:

Players: "You" & "${partnerName}"
Pack: ${packKey || 'general'}
Match rate: ${pct}%
Questions & Answers:
${qaList}

Generate a fun, creative, shareable "Vibe Report" in JSON format. Respond in ${langNames[lang] || 'English'}.

Requirements:
- "headline": A punchy, creative 4-8 word title for their dynamic (not generic — reference specific answers if possible)
- "narrative": 2-3 sentences. Be specific about their actual answers. Use <strong> tags for emphasis on key phrases. Be warm but funny. Reference actual surprising matches or funny differences.
- "superlatives": Array of exactly 3 fun awards. Each has:
  - "icon": a single emoji
  - "label": short award category (e.g. "Most Aligned On", "Biggest Plot Twist", "The One That Hurt")
  - "text": 1 short sentence referencing actual Q&A
- "metaphor": A creative duo archetype/metaphor (e.g. "The Jazz Duo", "Chaotic Roommates", "The Brain Cell Sharers")
- "metaphor_label": Short label like "Your Duo Archetype" (translated)
- "metaphor_desc": 1 sentence explaining the metaphor, tied to their actual answers

Be creative, funny, specific. Do NOT be generic. Reference their actual answers. Keep it light and shareable.
Return ONLY valid JSON, no markdown fences.`;

  try {
    const res = await fetch(`${API_URL}/claude?nocache=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'blindside-vibes' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const result = await res.json();
    const text = result?.content?.[0]?.text;
    if (!text) return null;
    // Parse JSON — handle potential markdown fences
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('AI vibe report failed:', e);
    return null;
  }
}

async function loadVibeReport(data, partnerName, pct, packKey) {
  const container = document.getElementById('vibeReportSlot');
  if (!container) return;
  const report = await generateVibeReport(data, partnerName, pct, packKey);
  if (report && report.headline) {
    container.innerHTML = renderVibeReport(report);
  } else {
    // Remove the loading skeleton on failure
    container.innerHTML = '';
  }
}

async function buildReceiptFromApi(code) {
  const scroll = document.getElementById('storyScroll');
  scroll.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-dim)"><div class="dot-pulse" style="margin:0 auto"></div><p style="margin-top:16px">loading results...</p></div>';

  try {
    const result = await blindApi.getResults(code);
    if (result.error) {
      scroll.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-dim)"><p>could not load results</p><button class="btn btn-ghost" onclick="goTo(\'home\')">back home</button></div>';
      return;
    }

    const s = result.session;
    const answers = result.answers;
    const isCreator = currentUser && s.creator_id === currentUser.id;
    const myId = currentUser?.id;
    const partnerId = isCreator ? s.partner_id : s.creator_id;
    const partnerName = isCreator ? s.partner_username : s.creator_username;

    // Build reveal data from real answers — compare by index, display in viewer's language
    // Helper: parse answer as option index if it's a number (int or float like 0.0)
    function toIdx(raw) {
      if (typeof raw === 'number') return Math.round(raw);
      if (typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw.trim())) return Math.round(parseFloat(raw));
      return null;
    }
    revealData = questions.map((q, i) => {
      const qAnswers = answers[i] || {};
      const rawUser = qAnswers[myId] != null ? qAnswers[myId] : (selectedAnswers[i] != null ? selectedAnswers[i] : '?');
      const rawPartner = qAnswers[partnerId] != null ? qAnswers[partnerId] : '?';
      const userIdx = toIdx(rawUser);
      const partnerIdx = toIdx(rawPartner);
      const userAns = userIdx != null && q.options[userIdx] ? q.options[userIdx] : String(rawUser);
      const partnerAns = partnerIdx != null && q.options[partnerIdx] ? q.options[partnerIdx] : String(rawPartner);
      const matched = (userIdx != null && partnerIdx != null) ? userIdx === partnerIdx : userAns === partnerAns;
      return { q: q.q, userAns, partnerAns, matched };
    });

    buildReceiptWithName(partnerName || 'partner');
  } catch (e) {
    console.error('Failed to load results:', e);
    scroll.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-dim)"><p>could not load results</p><button class="btn btn-ghost" onclick="goTo(\'home\')">back home</button></div>';
  }
}

function buildReceiptWithName(partnerName) {
  const data = revealData;
  const matches = data.filter(d => d.matched).length;
  const total = data.length;
  const pct = Math.round((matches / total) * 100);
  const vibeLabels = [
    { min: 0,  emoji: '🫠', title: 'Wildly Different', desc: 'opposites attract...right?', intro: 'Well, this was... <strong>eventful</strong>. You two see the world through very different lenses — and honestly, that might be the most interesting part.' },
    { min: 20, emoji: '🌀', title: 'Unpredictable Duo', desc: 'never a boring moment', intro: 'You two are <strong>unpredictable</strong> in the best way. Not always on the same page, but always an interesting read.' },
    { min: 40, emoji: '🤝', title: 'Getting There', desc: 'common ground exists', intro: 'There\'s real <strong>overlap</strong> here — and where there isn\'t, there\'s curiosity. That counts for a lot.' },
    { min: 60, emoji: '💜', title: 'Real Ones', desc: 'you get each other', intro: 'You two <strong>get each other</strong>. Not perfectly, not always — but more than most. And the differences? That\'s where the good conversations live.' },
    { min: 80, emoji: '🔮', title: 'Mind Readers', desc: 'basically the same person', intro: 'OK this is getting <strong>suspicious</strong>. You two are answering like you share a brain. Who copied who?' },
    { min: 100, emoji: '👽', title: 'Literally Telepathic', desc: 'this is actually scary', intro: '<strong>Every. Single. One.</strong> You matched on all of them. This is either beautiful or terrifying. Probably both.' },
  ];
  const vibe = [...vibeLabels].reverse().find(v => pct >= v.min);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  let chaptersHtml = '';
  data.forEach((d, i) => {
    chaptersHtml += `
      <div class="story-chapter">
        <div class="ch-num">${i + 1} ${i18n.t('results_of')} ${total}</div>
        <div class="ch-question">${d.q}</div>
        <div class="ch-answers">
          <div class="ch-ans ch-you">
            <div class="ch-label">${i18n.t('results_you')}</div>
            <div class="ch-text">${d.userAns}</div>
          </div>
          <div class="ch-ans ch-them">
            <div class="ch-label">${partnerName}</div>
            <div class="ch-text">${d.partnerAns}</div>
          </div>
        </div>
      </div>
    `;
  });

  const scroll = document.getElementById('storyScroll');
  scroll.innerHTML = `
    <div class="story-hero">
      <div class="story-hero-top">
        <div class="story-hero-emoji">${vibe.emoji}</div>
        <div class="story-hero-score">${pct}%</div>
      </div>
      <div class="story-hero-vibe">${vibe.title}</div>
      <div class="story-hero-sub">${vibe.desc}</div>
      <div class="story-hero-names">${i18n.t('results_you')} & ${partnerName}</div>
    </div>
    <div class="story-intro"><p>${vibe.intro}</p></div>
    <!-- <div id="vibeReportSlot">${getVibeReportLoadingHtml()}</div> -->
    ${chaptersHtml}
    <div class="story-outro">
      <div class="story-stats">
        <div><div class="story-stat-val">${matches}</div><div class="story-stat-lbl">${i18n.t('results_matches')}</div></div>
        <div><div class="story-stat-val">${total - matches}</div><div class="story-stat-lbl">${i18n.t('results_plot_twists')}</div></div>
        <div><div class="story-stat-val">${pct}%</div><div class="story-stat-lbl">${i18n.t('results_sync_rate')}</div></div>
      </div>
      <div class="story-brand">blindside.</div>
      <div class="story-date">${dateStr}</div>
    </div>
    <div class="story-actions">
      <button class="btn-share" onclick="shareReceipt()">${i18n.t('results_share')}</button>
      <button class="btn btn-primary" style="width:100%" onclick="goTo('packs')">${i18n.t('results_play_another')}</button>
      <button class="btn btn-ghost" onclick="goTo('home');loadHomeSessions()">${i18n.t('results_back_home')}</button>
    </div>
  `;
  scroll.scrollTop = 0;
  spawnConfetti();
  // AI vibe report disabled for now
  // loadVibeReport(data, partnerName, pct, selectedPackKey);
}

function buildReceipt() {
  const data = revealData.length ? revealData : questions.map((q, i) => {
    const userIdx = selectedAnswers[i] != null ? selectedAnswers[i] : 0;
    const partnerIdx = q.partnerAnswerIndex;
    return { q: q.q, userAns: q.options[userIdx], partnerAns: q.options[partnerIdx], matched: userIdx === partnerIdx };
  });

  const matches = data.filter(d => d.matched).length;
  const total = data.length;
  const pct = Math.round((matches / total) * 100);

  const vibeLabels = [
    { min: 0,  emoji: '🫠', title: 'Wildly Different', desc: 'opposites attract...right?', intro: 'Well, this was... <strong>eventful</strong>. You two see the world through very different lenses — and honestly, that might be the most interesting part.' },
    { min: 20, emoji: '🌀', title: 'Unpredictable Duo', desc: 'never a boring moment', intro: 'You two are <strong>unpredictable</strong> in the best way. Not always on the same page, but always an interesting read.' },
    { min: 40, emoji: '🤝', title: 'Getting There', desc: 'common ground exists', intro: 'There\'s real <strong>overlap</strong> here — and where there isn\'t, there\'s curiosity. That counts for a lot.' },
    { min: 60, emoji: '💜', title: 'Real Ones', desc: 'you get each other', intro: 'You two <strong>get each other</strong>. Not perfectly, not always — but more than most. And the differences? That\'s where the good conversations live.' },
    { min: 80, emoji: '🔮', title: 'Mind Readers', desc: 'basically the same person', intro: 'OK this is getting <strong>suspicious</strong>. You two are answering like you share a brain. Who copied who?' },
    { min: 100, emoji: '👽', title: 'Literally Telepathic', desc: 'this is actually scary', intro: '<strong>Every. Single. One.</strong> You matched on all of them. This is either beautiful or terrifying. Probably both.' },
  ];
  const vibe = [...vibeLabels].reverse().find(v => pct >= v.min);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Build chapters
  let chaptersHtml = '';
  data.forEach((d, i) => {
    chaptersHtml += `
      <div class="story-chapter">
        <div class="ch-num">${i + 1} ${i18n.t('results_of')} ${total}</div>
        <div class="ch-question">${d.q}</div>
        <div class="ch-answers">
          <div class="ch-ans ch-you">
            <div class="ch-label">${i18n.t('results_you')}</div>
            <div class="ch-text">${d.userAns}</div>
          </div>
          <div class="ch-ans ch-them">
            <div class="ch-label">alex</div>
            <div class="ch-text">${d.partnerAns}</div>
          </div>
        </div>
      </div>
    `;
  });

  const scroll = document.getElementById('storyScroll');
  scroll.innerHTML = `
    <div class="story-hero">
      <div class="story-hero-top">
        <div class="story-hero-emoji">${vibe.emoji}</div>
        <div class="story-hero-score">${pct}%</div>
      </div>
      <div class="story-hero-vibe">${vibe.title}</div>
      <div class="story-hero-sub">${vibe.desc}</div>
      <div class="story-hero-names">${i18n.t('results_you')} & Alex</div>
    </div>

    <div class="story-intro">
      <p>${vibe.intro}</p>
    </div>

    <!-- <div id="vibeReportSlot">${getVibeReportLoadingHtml()}</div> -->

    ${chaptersHtml}

    <div class="story-outro">
      <div class="story-stats">
        <div>
          <div class="story-stat-val">${matches}</div>
          <div class="story-stat-lbl">${i18n.t('results_matches')}</div>
        </div>
        <div>
          <div class="story-stat-val">${total - matches}</div>
          <div class="story-stat-lbl">${i18n.t('results_plot_twists')}</div>
        </div>
        <div>
          <div class="story-stat-val">${pct}%</div>
          <div class="story-stat-lbl">${i18n.t('results_sync_rate')}</div>
        </div>
      </div>
      <div class="story-brand">blindside.</div>
      <div class="story-date">${dateStr}</div>
    </div>

    <div class="story-actions">
      <button class="btn-share" onclick="shareReceipt()">${i18n.t('results_share')}</button>
      <button class="btn btn-primary" style="width:100%" onclick="goTo('packs')">${i18n.t('results_play_another')}</button>
      <button class="btn btn-ghost" onclick="goTo('home')">${i18n.t('results_back_home')}</button>
    </div>
  `;

  scroll.scrollTop = 0;
  spawnConfetti();
  // AI vibe report disabled for now
  // loadVibeReport(data, 'Alex', pct, selectedPackKey);
}

function shareReceipt() {
  if (navigator.share) {
    navigator.share({
      title: 'blindside. vibe check',
      text: 'We just did a blind reveal — check our results!',
    }).catch(() => {});
  } else {
    const btn = event.target;
    btn.textContent = i18n.t('feedback_link_copied');
    setTimeout(() => { btn.innerHTML = i18n.t('results_share'); }, 2000);
  }
}

// Keep animateResults as alias for backward compat
function animateResults() { buildReceipt(); }

// ==================== INIT: URL JOIN + AUTO-LOGIN ====================
(function init() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('join');

  if (code) {
    joinCode = code;
    if (currentUser) {
      // Already logged in, join directly
      handleJoinCode(code);
      joinCode = null;
    } else {
      // Need to auth first
      goTo('auth');
      setTimeout(() => document.getElementById('authUsername')?.focus(), 300);
    }
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  } else if (currentUser) {
    // Auto-login: skip splash, go to home
    goTo('home');
  }
})();
