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

  auth(username, password) {
    return this._fetch('/api/blind/auth', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  checkUsername(username) {
    return this._fetch('/api/blind/auth/check', {
      method: 'POST',
      body: JSON.stringify({ username })
    });
  },

  guestAuth(displayName) {
    return this._fetch('/api/blind/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ displayName })
    });
  },

  upgradeGuest(password) {
    return this._fetch('/api/blind/auth/upgrade', {
      method: 'POST',
      body: JSON.stringify({ password })
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
  },

  deleteSession(code) {
    return this._fetch(`/api/blind/sessions/${code}`, { method: 'DELETE' });
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
let isGuest = JSON.parse(localStorage.getItem('bs-guest') || 'false');
let pendingAuthUsername = null; // holds username between auth step 1 and step 2


// packDefs + questionPacks are loaded from packs.js

// Check if a pack is solo (no partner needed)
function isSoloPack(key) {
  const def = packDefs.find(p => p.key === key);
  return def && def.solo === true;
}

// Get current language questions for a pack, sorted so swipe-format questions come last
function getQuestions(packKey) {
  const lang = i18n.current;
  const pack = questionPacks[lang]?.[packKey] || questionPacks.en[packKey];
  const mapped = pack.map(q => ({
    q: q.q,
    options: q.options,
    partnerAnswerIndex: q.pi,
    traits: q.traits || null,
    format: q.format || null
  }));
  // Sort: non-swipe first, swipe last
  const normal = mapped.filter(q => q.format !== 'swipe');
  const swipe = mapped.filter(q => q.format === 'swipe');
  return [...normal, ...swipe];
}

// Check if a question index has a valid answer (handles both single and multi-select)
function hasAnswer(qi) {
  const a = selectedAnswers[qi];
  if (Array.isArray(a)) return a.length > 0;
  return a !== undefined && a !== null;
}

// Get display text for an answer (handles both single index and array of indices)
function getAnswerText(qi, q) {
  const a = selectedAnswers[qi];
  if (a == null) return '—';
  if (Array.isArray(a)) return a.map(idx => q.options[idx]).join(', ');
  return q.options[a] || '—';
}

// Check if a multi-select answer includes the partner's pick
function answerMatches(qi, partnerIdx) {
  const a = selectedAnswers[qi];
  if (Array.isArray(a)) return a.includes(partnerIdx);
  return a === partnerIdx;
}

let questions = getQuestions('couples');

// ==================== AUTH FLOW ====================
function showAuth(target) {
  afterAuthTarget = target;
  if (currentUser) {
    goTo(afterAuthTarget);
    return;
  }
  // If joining via invite, show guest auth
  if (joinCode) {
    goTo('guestAuth');
    setTimeout(() => document.getElementById('guestName')?.focus(), 300);
    return;
  }
  goTo('auth');
  resetAuthSteps();
  setTimeout(() => document.getElementById('authUsername')?.focus(), 300);
}

function resetAuthSteps() {
  document.getElementById('authStep1').style.display = '';
  document.getElementById('authStep2Login').style.display = 'none';
  document.getElementById('authStep2Signup').style.display = 'none';
  document.getElementById('authError').textContent = '';
  document.getElementById('loginError').textContent = '';
  document.getElementById('signupError').textContent = '';
  const pwFields = document.querySelectorAll('#auth input[type="password"]');
  pwFields.forEach(f => f.value = '');
  pendingAuthUsername = null;
}

// Step 1: Check if username exists
async function doAuthStep1() {
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
    const check = await blindApi.checkUsername(username);
    if (check.error) { err.textContent = check.error; return; }

    pendingAuthUsername = username;
    document.getElementById('authStep1').style.display = 'none';

    if (check.exists) {
      document.getElementById('loginGreeting').innerHTML = `signing in as <strong>${username}</strong>`;
      document.getElementById('authStep2Login').style.display = '';
      setTimeout(() => document.getElementById('loginPassword')?.focus(), 200);

      // If user has no password (legacy), skip password step
      if (!check.has_password) {
        const data = await blindApi.auth(username);
        if (data.user) { finishAuth(data.user); return; }
      }
    } else {
      document.getElementById('signupGreeting').innerHTML = `nice to meet you, <strong>${username}</strong>`;
      document.getElementById('authStep2Signup').style.display = '';
      setTimeout(() => document.getElementById('signupPassword')?.focus(), 200);
    }
  } catch (e) {
    err.textContent = 'connection error, try again';
  } finally {
    btn.disabled = false;
    btn.textContent = 'continue';
  }
}

// Step 2a: Login with password
async function doLogin() {
  const password = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  if (!password) { err.textContent = 'enter your password'; return; }

  btn.disabled = true;
  btn.textContent = '...';
  err.textContent = '';

  try {
    const data = await blindApi.auth(pendingAuthUsername, password);
    if (data.error) { err.textContent = data.error; return; }

    finishAuth(data.user);
  } catch (e) {
    err.textContent = 'connection error, try again';
  } finally {
    btn.disabled = false;
    btn.textContent = 'sign in';
  }
}

// Step 2b: Signup with password
async function doSignup() {
  const password = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupPasswordConfirm').value;
  const err = document.getElementById('signupError');
  const btn = document.getElementById('signupBtn');

  if (password.length < 4) { err.textContent = 'password must be at least 4 characters'; return; }
  if (password !== confirm) { err.textContent = 'passwords don\'t match'; return; }

  btn.disabled = true;
  btn.textContent = '...';
  err.textContent = '';

  try {
    const data = await blindApi.auth(pendingAuthUsername, password);
    if (data.error) { err.textContent = data.error; return; }

    finishAuth(data.user);
  } catch (e) {
    err.textContent = 'connection error, try again';
  } finally {
    btn.disabled = false;
    btn.textContent = 'create account';
  }
}

function authGoBack() {
  document.getElementById('authStep2Login').style.display = 'none';
  document.getElementById('authStep2Signup').style.display = 'none';
  document.getElementById('authStep1').style.display = '';
  document.getElementById('loginError').textContent = '';
  document.getElementById('signupError').textContent = '';
  const pwFields = document.querySelectorAll('#auth input[type="password"]');
  pwFields.forEach(f => f.value = '');
  setTimeout(() => document.getElementById('authUsername')?.focus(), 200);
}

// Shared: finish auth and proceed
function finishAuth(user) {
  currentUser = user;
  localStorage.setItem('bs-user', JSON.stringify(currentUser));
  localStorage.setItem('bs-user-id', currentUser.id);
  localStorage.removeItem('bs-guest');
  isGuest = false;

  if (joinCode) {
    handleJoinCode(joinCode);
    joinCode = null;
    return;
  }

  goTo(afterAuthTarget);
}

// Guest auth (join via invite link without account)
async function doGuestAuth() {
  const input = document.getElementById('guestName');
  const err = document.getElementById('guestAuthError');
  const btn = document.getElementById('guestAuthBtn');
  const displayName = input.value.trim();

  if (displayName.length < 2) {
    err.textContent = 'at least 2 characters';
    return;
  }

  btn.disabled = true;
  btn.textContent = '...';
  err.textContent = '';

  try {
    const data = await blindApi.guestAuth(displayName);
    if (data.error) { err.textContent = data.error; return; }

    currentUser = data.user;
    localStorage.setItem('bs-user', JSON.stringify(currentUser));
    localStorage.setItem('bs-user-id', currentUser.id);
    localStorage.setItem('bs-guest', 'true');
    isGuest = true;

    if (joinCode) {
      await handleJoinCode(joinCode);
      joinCode = null;
      return;
    }
    goTo('home');
  } catch (e) {
    err.textContent = 'connection error, try again';
  } finally {
    btn.disabled = false;
    btn.textContent = 'play as guest';
  }
}

function guestToFullAuth() {
  goTo('auth');
  resetAuthSteps();
  setTimeout(() => document.getElementById('authUsername')?.focus(), 300);
}

// Enter key handlers
document.getElementById('authUsername')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') doAuthStep1();
});
document.getElementById('loginPassword')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});
document.getElementById('signupPasswordConfirm')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSignup();
});
document.getElementById('signupPassword')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('signupPasswordConfirm')?.focus();
});
document.getElementById('guestName')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') doGuestAuth();
});

// Save guest account (after session)
async function saveGuestAccount() {
  const password = document.getElementById('saveAccPassword').value;
  const confirm = document.getElementById('saveAccPasswordConfirm').value;
  const err = document.getElementById('saveAccError');

  if (password.length < 4) { err.textContent = 'password must be at least 4 characters'; return; }
  if (password !== confirm) { err.textContent = 'passwords don\'t match'; return; }

  err.textContent = '';

  try {
    const data = await blindApi.upgradeGuest(password);
    if (data.error) { err.textContent = data.error; return; }

    localStorage.removeItem('bs-guest');
    isGuest = false;
    closeSaveAccountModal();

    // Update user if returned
    if (data.user) {
      currentUser = data.user;
      localStorage.setItem('bs-user', JSON.stringify(currentUser));
    }
  } catch (e) {
    err.textContent = 'connection error, try again';
  }
}

function showSaveAccountModal() {
  if (sessionStorage.getItem('bs-save-prompt-dismissed')) return;
  document.getElementById('saveAccPassword').value = '';
  document.getElementById('saveAccPasswordConfirm').value = '';
  document.getElementById('saveAccError').textContent = '';
  document.getElementById('saveAccountModal').classList.add('show');
}

function closeSaveAccountModal() {
  document.getElementById('saveAccountModal').classList.remove('show');
  sessionStorage.setItem('bs-save-prompt-dismissed', 'true');
}

function switchUser() {
  currentUser = null;
  currentSession = null;
  isGuest = false;
  localStorage.removeItem('bs-user');
  localStorage.removeItem('bs-user-id');
  localStorage.removeItem('bs-guest');
  stopPolling();
  document.getElementById('authUsername').value = '';
  resetAuthSteps();
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

  const packEmojis = { couples: '💕', bestfriends: '👯', deeptalk: '🌊', coworkers: '💼', '36questions': '❤️‍🔥', hottakes: '🌶️', redflags: '🚩', chaotic: '🎲', fungames: '🎉', worldtaste: '🌍', ethics: '⚖️', situations: '😱', livingtogether: '🏠', soulspirit: '🕊️', attachment: '🔗', innermirror: '🪞', stresstype: '🧊', lovelang: '💌', shadow: '🌑', emotionalage: '🎭', boundaries: '🚧', selfsabotage: '🪤', hisarchetype: '🐕', girlfriendera: '👑', couplestory: '📖', whathehides: '🎭' };
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

// Pack mode: 'partner' (duo) or 'self' (solo)
let activePackMode = 'partner';

function setPackMode(mode) {
  activePackMode = mode;
  document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  renderPacksFeatured();
  renderCollections();
  renderPacksGridCards();
}

// Render featured carousel
function renderPacksFeatured() {
  const el = document.getElementById('packsFeatured');
  if (!el) return;
  const isSelf = activePackMode === 'self';
  const featured = packDefs.filter(p => p.featured && (isSelf ? p.solo : !p.solo));
  const featuredSection = document.getElementById('packsFeaturedSection');
  if (featuredSection) featuredSection.style.display = featured.length ? '' : 'none';
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

// Render collection cards
function renderCollections() {
  const grid = document.getElementById('collectionsGrid');
  if (!grid) return;
  const isSelf = activePackMode === 'self';
  const collections = packCollections.filter(c => isSelf ? c.mode === 'self' : c.mode === 'partner');
  grid.innerHTML = collections.map((c, idx) => {
    const deckCount = c.packs.length;
    const totalPlays = c.packs.reduce((sum, key) => {
      const def = packDefs.find(p => p.key === key);
      if (!def) return sum;
      const num = parseFloat(def.plays.replace('k', ''));
      return sum + num;
    }, 0);
    const badgeHtml = c.badge
      ? `<span class="coll-badge badge-${c.badge}">${i18n.t('badge_' + c.badge)}</span>`
      : '';
    const emojiPreview = c.packs.slice(0, 3).map(key => {
      const def = packDefs.find(p => p.key === key);
      return def ? def.emoji : '';
    }).join('');
    return `<div class="collection-card" style="animation-delay:${idx * 0.06}s" onclick="openCollection('${c.key}')">
      <div class="coll-card-bg" style="background:linear-gradient(135deg,${c.gradient[0]},${c.gradient[1]})"></div>
      <div class="coll-card-content">
        <div class="coll-card-top">
          <span class="coll-emoji">${c.emoji}</span>
          ${badgeHtml}
        </div>
        <div class="coll-card-title">${i18n.t(c.nameKey)}</div>
        <div class="coll-card-desc">${i18n.t(c.descKey)}</div>
        <div class="coll-card-footer">
          <span class="coll-deck-count">${deckCount} ${i18n.t('coll_decks')}</span>
          <span class="coll-preview-emojis">${emojiPreview}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Open a collection detail screen
let currentCollectionKey = null;
function openCollection(key) {
  currentCollectionKey = key;
  const coll = packCollections.find(c => c.key === key);
  if (!coll) return;
  goTo('collectionDetail');
}

function renderCollectionDetail() {
  const coll = packCollections.find(c => c.key === currentCollectionKey);
  if (!coll) return;

  const header = document.getElementById('collDetailHeader');
  const grid = document.getElementById('collDetailGrid');

  header.innerHTML = `
    <div class="coll-detail-hero" style="--coll-g1:${coll.gradient[0]};--coll-g2:${coll.gradient[1]}">
      <button class="btn-icon coll-back-btn" onclick="goTo('packs')">←</button>
      <div class="coll-hero-icon-wrap">
        <div class="coll-hero-icon-glow"></div>
        <div class="coll-hero-icon">${coll.emoji}</div>
      </div>
      <h2 class="coll-hero-title">${i18n.t(coll.nameKey)}</h2>
      <p class="coll-hero-desc">${i18n.t(coll.descKey)}</p>
      <div class="coll-hero-chips">
        <span class="coll-chip">${coll.packs.length} ${i18n.t('coll_decks')}</span>
      </div>
    </div>
  `;

  const packs = coll.packs.map(key => packDefs.find(p => p.key === key)).filter(Boolean);
  grid.innerHTML = packs.map((p, idx) => {
    const badgeHtml = p.badge
      ? `<span class="pack-badge badge-${p.badge}">${i18n.t('badge_' + p.badge)}</span>`
      : '';
    return `<div class="pack-card glass" style="animation-delay:${idx * 0.04}s" onclick="selectPack('${p.key}')">
      <div class="pack-emoji">${p.emoji}</div>
      <div class="pack-info">
        <div class="pack-title">${i18n.t(p.nameKey)}</div>
        <div class="pack-meta-row">
          <span class="pack-plays">${p.plays} ${i18n.t('packs_played')}</span>
          <span class="pack-count">${i18n.t(p.countKey)}</span>
          ${badgeHtml}
        </div>
      </div>
      <span class="pack-arrow">›</span>
    </div>`;
  }).join('');
}

// Render all packs list (below collections)
function renderPacksGridCards() {
  const grid = document.getElementById('packsGrid');
  if (!grid) return;
  const isSelf = activePackMode === 'self';
  let filtered = packDefs.filter(p => isSelf ? p.solo : !p.solo);
  grid.innerHTML = filtered.map((p, idx) => {
    const badgeHtml = p.badge
      ? `<span class="pack-badge badge-${p.badge}">${i18n.t('badge_' + p.badge)}</span>`
      : '';
    return `<div class="pack-card glass" style="animation-delay:${idx * 0.04}s" onclick="selectPack('${p.key}')">
      <div class="pack-emoji">${p.emoji}</div>
      <div class="pack-info">
        <div class="pack-title">${i18n.t(p.nameKey)}</div>
        <div class="pack-meta-row">
          <span class="pack-plays">${p.plays} ${i18n.t('packs_played')}</span>
          <span class="pack-count">${i18n.t(p.countKey)}</span>
          ${badgeHtml}
        </div>
      </div>
      <span class="pack-arrow">›</span>
    </div>`;
  }).join('');
}

// Full packs render
function renderPacksGrid() {
  renderPacksFeatured();
  renderCollections();
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
    if (screenId === 'collectionDetail') { updateNav('packs'); renderCollectionDetail(); }
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

  // Solo packs skip invite — go straight to quiz
  if (def.solo) {
    currentSession = null;
    currentQuestion = 0;
    selectedAnswers = {};
    questionModes = [];
    goTo('quiz');
    return;
  }

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
const FORMAT_TO_MODE = { vs: 'thisOrThat', bubble: 'bubblePop', swipe: 'swipe' };
const MODE_LABELS = { classic: '✏️', thisOrThat: '⚔️ This or That', bubblePop: '🫧 Bubble Pop', blitz: '⚡ Blitz', swipe: '👆 Swipe Pick' };
let questionModes = [];
let blitzInterval = null;

function assignQuestionModes() {
  questionModes = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    // If question has explicit format, use it
    if (q.format && FORMAT_TO_MODE[q.format]) {
      questionModes.push(FORMAT_TO_MODE[q.format]);
      continue;
    }
    // Otherwise alternate between classic and blitz, no repeats
    if (i === 0 || questionModes.length === 0) { questionModes.push('classic'); continue; }
    const last = questionModes[questionModes.length - 1];
    const available = ['classic', 'blitz'].filter(m => m !== last);
    questionModes.push(available[Math.floor(Math.random() * available.length)]);
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
  nextBtn.disabled = !hasAnswer(currentQuestion);
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

// --- THIS OR THAT (2-option VS) ---
function renderThisOrThat(body, q) {
  const opts = q.options.slice(0, 2); // VS always uses first 2 options
  const s = selectedAnswers[currentQuestion];
  body.innerHTML = `
    <div class="tot-layout" key="${currentQuestion}">
      <div class="question-text" style="font-size:19px">${q.q}</div>
      <div class="tot-matchup tot-single">
        ${opts.map((opt, i) =>
          `<div class="tot-side ${s === i ? 'selected' : (s !== undefined && s !== i ? 'dimmed' : '')}"
                onclick="selectTot(${currentQuestion}, ${i})">${opt}</div>`
        ).join('<div class="tot-vs">VS</div>')}
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

// --- BUBBLE POP (multi-select) ---
function renderBubblePop(body, q) {
  const pos = [
    { top: '5%', left: '8%', size: 120 },
    { top: '2%', left: '55%', size: 110 },
    { top: '50%', left: '5%', size: 115 },
    { top: '48%', left: '52%', size: 125 },
    { top: '28%', left: '30%', size: 105 }
  ];
  const sel = Array.isArray(selectedAnswers[currentQuestion]) ? selectedAnswers[currentQuestion] : [];
  body.innerHTML = `
    <div class="question-card" key="${currentQuestion}">
      <div class="mode-badge">${MODE_LABELS.bubblePop}</div>
      <div class="question-text" style="font-size:19px">${q.q}</div>
      <div class="bubble-hint">${i18n.t('bubble_hint') || 'tap all that apply'}</div>
      <div class="bubble-field">
        ${q.options.map((opt, oi) => {
          const p = pos[oi];
          return `<div class="bubble ${sel.includes(oi) ? 'selected' : ''}"
                       style="top:${p.top};left:${p.left};width:${p.size}px;height:${p.size}px"
                       onclick="selectBubble(${currentQuestion}, ${oi})">${opt}</div>`;
        }).join('')}
      </div>
    </div>`;
}
function selectBubble(qi, ans) {
  if (!Array.isArray(selectedAnswers[qi])) selectedAnswers[qi] = [];
  const arr = selectedAnswers[qi];
  const idx = arr.indexOf(ans);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(ans);
  document.getElementById('quizNextBtn').disabled = arr.length === 0;
  document.querySelectorAll('.bubble').forEach((el, i) => {
    el.classList.remove('selected');
    if (arr.includes(i)) el.classList.add('selected');
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

// --- SWIPE PICK (full-card multi-select list) ---
function renderSwipe(body, q) {
  const sel = Array.isArray(selectedAnswers[currentQuestion]) ? selectedAnswers[currentQuestion] : [];
  body.innerHTML = `
    <div class="question-card swipe-card-question" key="${currentQuestion}">
      <div class="mode-badge">${MODE_LABELS.swipe}</div>
      <div class="question-text" style="font-size:19px">${q.q}</div>
      <div class="swipe-hint">${i18n.t('swipe_hint') || 'pick all that fit'}</div>
      <div class="swipe-list" id="swipeList">
        ${q.options.map((opt, oi) => `
          <div class="swipe-list-card ${sel.includes(oi) ? 'selected' : ''}"
               onclick="toggleSwipeCard(${currentQuestion}, ${oi})" data-idx="${oi}">
            <span class="swipe-list-text">${opt}</span>
            <span class="swipe-list-check">${sel.includes(oi) ? '✓' : ''}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function toggleSwipeCard(qi, ans) {
  if (!Array.isArray(selectedAnswers[qi])) selectedAnswers[qi] = [];
  const arr = selectedAnswers[qi];
  const idx = arr.indexOf(ans);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(ans);
  document.getElementById('quizNextBtn').disabled = arr.length === 0;
  document.querySelectorAll('.swipe-list-card').forEach(el => {
    const i = parseInt(el.dataset.idx);
    const isSelected = arr.includes(i);
    el.classList.toggle('selected', isSelected);
    el.querySelector('.swipe-list-check').textContent = isSelected ? '✓' : '';
  });
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
  if (!hasAnswer(currentQuestion)) return;

  if (currentQuestion === questions.length - 1) {
    // Solo packs skip the confirmation modal — submit directly
    if (isSoloPack(selectedPackKey)) {
      submitAnswers();
      return;
    }
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

  // Delete on server
  blindApi.deleteSession(code).catch(() => {});

  // Persist in localStorage as fallback
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

  // Solo packs — skip API, go straight to solo results
  if (isSoloPack(selectedPackKey)) {
    goTo('results');
    buildSoloReceipt();
    return;
  }

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
    // Set avatar initials
    const myName = currentUser?.username || '?';
    document.getElementById('waitingAvatarYou').textContent = myName.charAt(0).toUpperCase();
    const partner = currentSession.creator_id === currentUser?.id
      ? currentSession.partner_username
      : currentSession.creator_username;
    const themCircle = document.querySelector('.duo-circle.them');
    if (partner) {
      document.getElementById('waitingAvatarThem').textContent = partner.charAt(0).toUpperCase();
      themCircle.classList.add('active');
    } else {
      document.getElementById('waitingAvatarThem').textContent = '?';
      themCircle.classList.remove('active');
    }
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
        // Activate partner circle
        const themCircle = document.querySelector('.duo-circle.them');
        if (themCircle && !themCircle.classList.contains('active')) {
          document.getElementById('waitingAvatarThem').textContent = (pName || '?').charAt(0).toUpperCase();
          themCircle.classList.add('active');
        }
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
    const raw = selectedAnswers[i];
    const partnerIdx = q.partnerAnswerIndex;
    let userAns, matched;
    if (Array.isArray(raw)) {
      userAns = raw.map(idx => q.options[idx]).join(', ');
      matched = raw.includes(partnerIdx);
    } else {
      const userIdx = raw != null ? raw : 0;
      userAns = q.options[userIdx];
      matched = userIdx === partnerIdx;
    }
    return { q: q.q, userAns, partnerAns: q.options[partnerIdx], matched };
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
  const langNames = { en: 'English', tr: 'Turkish', th: 'Thai' };

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
    // Helper: parse answer — handles single index, array of indices, or string
    function toIdx(raw) {
      if (typeof raw === 'number') return Math.round(raw);
      if (typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw.trim())) return Math.round(parseFloat(raw));
      return null;
    }
    function resolveAnswer(raw, q) {
      if (Array.isArray(raw)) {
        const texts = raw.map(r => {
          const idx = toIdx(r);
          return idx != null && q.options[idx] ? q.options[idx] : String(r);
        });
        return { text: texts.join(', '), indices: raw.map(r => toIdx(r)) };
      }
      const idx = toIdx(raw);
      const text = idx != null && q.options[idx] ? q.options[idx] : String(raw);
      return { text, indices: idx != null ? [idx] : [] };
    }
    revealData = questions.map((q, i) => {
      const qAnswers = answers[i] || {};
      const rawUser = qAnswers[myId] != null ? qAnswers[myId] : (selectedAnswers[i] != null ? selectedAnswers[i] : '?');
      const rawPartner = qAnswers[partnerId] != null ? qAnswers[partnerId] : '?';
      const user = resolveAnswer(rawUser, q);
      const partner = resolveAnswer(rawPartner, q);
      // Match: any overlap between user's and partner's selected indices
      const matched = user.indices.length && partner.indices.length
        ? user.indices.some(idx => partner.indices.includes(idx))
        : user.text === partner.text;
      return { q: q.q, userAns: user.text, partnerAns: partner.text, matched };
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

  // Prompt guests to save their account
  if (isGuest) setTimeout(showSaveAccountModal, 2000);
}

// ==================== SOLO RESULT DEFINITIONS ====================
const soloResultDefs = {
  attachment: {
    traits: ['anxious', 'avoidant', 'secure'],
    results: {
      anxious: { emoji: '💗', title: 'Anxious Attachment', desc: 'You love deeply and fear losing it. You crave closeness, reassurance, and can sense distance before it\'s spoken.', advice: 'Your capacity to love is a strength. Practice self-soothing and trust that silence doesn\'t mean abandonment.' },
      avoidant: { emoji: '🛡️', title: 'Avoidant Attachment', desc: 'Independence is your armor. You value space, freedom, and tend to pull away when things get too close.', advice: 'Your need for space is valid. Try letting one person in past the walls — vulnerability isn\'t weakness.' },
      secure: { emoji: '🌱', title: 'Secure Attachment', desc: 'You can be close without losing yourself. You communicate, trust, and handle conflict with grounded presence.', advice: 'You\'re the anchor. Keep modeling healthy relating — and don\'t forget to check in with your own needs too.' },
    }
  },
  innermirror: {
    traits: ['introvert', 'extrovert', 'thinker', 'feeler'],
    results: {
      introvert: { emoji: '🌙', title: 'The Inner World', desc: 'You recharge in solitude, process deeply, and prefer meaningful connection over surface-level interaction.', advice: 'Your depth is rare. Make sure you\'re not isolating — the right people deserve access to your inner world.' },
      extrovert: { emoji: '☀️', title: 'The Social Force', desc: 'People are your fuel. You thrive in groups, think out loud, and bring energy wherever you go.', advice: 'Your energy lights rooms up. Just remember: stillness isn\'t stagnation — rest is part of the rhythm.' },
      thinker: { emoji: '🧠', title: 'The Analyst', desc: 'Logic is your compass. You approach life with reason, structure, and a need to understand before you feel.', advice: 'Your clarity is powerful. Don\'t forget that feelings aren\'t inefficiencies — they\'re data too.' },
      feeler: { emoji: '🫀', title: 'The Empath', desc: 'You feel everything — yours and everyone else\'s. Emotion is your first language and your deepest strength.', advice: 'Your empathy is a gift. Set boundaries so you don\'t carry what isn\'t yours to hold.' },
    }
  },
  stresstype: {
    traits: ['fight', 'flight', 'fawn', 'freeze'],
    results: {
      fight: { emoji: '🔥', title: 'Fight Response', desc: 'Under pressure, you take control. You push harder, get louder, and channel stress into action — sometimes too much.', advice: 'Your drive is incredible. Learn to pause before reacting — not every stress needs a battle.' },
      flight: { emoji: '💨', title: 'Flight Response', desc: 'When things get heavy, you escape. Physically, mentally, digitally — you find a way out before the walls close in.', advice: 'Leaving is sometimes wisdom. But notice when you\'re running from growth, not danger.' },
      fawn: { emoji: '🕊️', title: 'Fawn Response', desc: 'You survive by pleasing. You read rooms, adjust yourself, and prioritize others\' comfort over your own truth.', advice: 'Your kindness is real. Start asking: "Am I being kind, or am I being safe?" They\'re not always the same.' },
      freeze: { emoji: '🧊', title: 'Freeze Response', desc: 'Overwhelm makes you still. You go quiet, numb, and wait for the storm to pass — often from the inside.', advice: 'Stillness can be wisdom. But practice small movements when frozen — one action can break the spell.' },
    }
  },
  lovelang: {
    traits: ['touch', 'words', 'acts', 'gifts', 'time'],
    results: {
      touch: { emoji: '🤲', title: 'Physical Touch', tagline: 'your love speaks through skin', desc: 'You communicate love through closeness — a hand on the back, a long hug, sitting pressed together on the couch. Words can lie. Touch doesn\'t. For you, presence is physical.', advice: 'Not everyone expresses love this way. Tell people what you need — they can\'t read your body if they speak a different love language.', youProbably: ['Hold people a beat longer than expected', 'Reach for someone\'s hand without thinking', 'Feel most hurt when someone flinches away', 'Judge relationships by how much physical warmth exists'] },
      words: { emoji: '💬', title: 'Words of Affirmation', tagline: 'you hear love before you feel it', desc: 'A well-timed "I\'m proud of you" can carry you for weeks. You remember compliments word-for-word, and silence from someone you love feels deafening.', advice: 'You give what you need — so you probably over-compliment and under-ask. Say it: "I need to hear that you value me."', youProbably: ['Screenshot meaningful texts', 'Remember exact words of a compliment from years ago', 'Feel crushed by a passive-aggressive tone', 'Write long heartfelt messages at 2am'] },
      acts: { emoji: '🔧', title: 'Acts of Service', tagline: 'love is a verb, not a word', desc: 'You don\'t want to hear "I love you" — you want to see it. A filled gas tank, a meal when you\'re tired, a solved problem you didn\'t ask for help with. That\'s romance.', advice: 'Be careful not to over-give and resent the imbalance. Notice when someone serves you in their own language, even if it\'s not yours.', youProbably: ['Do things for people without being asked', 'Feel deeply loved when someone handles your stress', 'Get frustrated by empty promises', 'Show love by fixing, carrying, handling logistics'] },
      gifts: { emoji: '🎁', title: 'Receiving Gifts', tagline: 'it\'s the thought that proves the love', desc: 'It was never about the price tag. It\'s the proof that someone thought of you when you weren\'t there. A random snack, a playlist, a "saw this and thought of you" — that\'s everything.', advice: 'People might misread this as materialism. Help them understand: the gift is evidence of attention, not transaction.', youProbably: ['Keep small meaningful objects forever', 'Feel hurt when someone forgets an occasion', 'Notice when someone remembers a tiny thing you mentioned', 'Put thought into every gift you give'] },
      time: { emoji: '⏳', title: 'Quality Time', tagline: 'your love currency is undivided attention', desc: 'A phone on the table during dinner is a rejection. You don\'t need activities — you need someone fully present, with nowhere else to be and no one else to text.', advice: 'In a distracted world, this is the hardest language to have. Be explicit: "I need your eyes, not your schedule."', youProbably: ['Notice immediately when someone checks their phone mid-conversation', 'Treasure lazy mornings with no plans', 'Feel rejected by chronic busyness', 'Fall hardest for people who make time stop'] },
    }
  },
  shadow: {
    traits: ['repressed_selfishness', 'repressed_vulnerability', 'repressed_authenticity', 'repressed_need'],
    results: {
      repressed_selfishness: { emoji: '👹', title: 'The Repressed Self', tagline: 'the part of you that wants without guilt', desc: 'You learned early that wanting things for yourself is dangerous. So you became the giver, the selfless one. But underneath, there\'s a version of you that\'s exhausted from never taking.', advice: 'Selfishness isn\'t your shadow — it\'s your unmet need for reciprocity. Start with small acts of self-priority. Taking doesn\'t make you bad.', youProbably: ['Say "I don\'t mind" when you absolutely do', 'Feel rage when someone takes without asking', 'Resent being "the reliable one"', 'Judge selfish people hardest because you envy their freedom'] },
      repressed_vulnerability: { emoji: '🥀', title: 'The Hidden Softness', tagline: 'strength was never a choice — it was survival', desc: 'You\'ve built an identity around being strong, capable, unbreakable. But your shadow holds the tears you never let fall, the help you never asked for, the softness you buried because someone once made it feel unsafe.', advice: 'Vulnerability isn\'t the opposite of strength — it\'s the upgrade. Let one person see the real weight. You don\'t have to shatter. Just crack the door.', youProbably: ['Cry alone but never in front of people', 'Feel uncomfortable when someone takes care of you', 'Get praised for "handling it so well" and feel like screaming', 'Attract people who lean on you but never ask how you are'] },
      repressed_authenticity: { emoji: '🎭', title: 'The Curated Self', tagline: 'the mask fits so well you forgot it\'s there', desc: 'You\'re not lying — you\'re performing. A version of you that\'s palatable, agreeable, conflict-free. Your shadow holds your real opinions, your anger, your "actually, no." You\'re so good at reading rooms that you forgot you\'re allowed to disrupt them.', advice: 'Honesty doesn\'t require cruelty. Start by noticing the moments you edit yourself. What would you say if you couldn\'t lose anyone for saying it?', youProbably: ['Agree with opinions you don\'t hold', 'Feel exhausted after social events from performing', 'Have different personalities for different groups', 'Fear being "too much" more than "not enough"'] },
      repressed_need: { emoji: '🕳️', title: 'The Hidden Need', tagline: 'you need people more than you let anyone see', desc: 'Independence is your brand. But it\'s also your prison. You\'ve convinced everyone — and almost yourself — that you\'re fine alone. Your shadow holds the ache for connection and the quiet loneliness of proving you don\'t need anyone.', advice: 'Needing someone doesn\'t make you weak. It makes you alive. Try saying "I missed you" without deflecting. Let it land.', youProbably: ['Leave conversations feeling disconnected but can\'t name why', 'Feel relief and panic in equal measure when someone gets close', 'Have acquaintances everywhere but few deep bonds', 'Push away people who try to check in'] },
    }
  },
  emotionalage: {
    traits: ['child', 'teen', 'adult', 'elder'],
    results: {
      child: { emoji: '🧒', title: 'The Inner Child', tagline: 'you feel everything at full volume', desc: 'Your emotional world is vivid, raw, and unfiltered. Joy is electric, rejection is catastrophic, and the need for safety drives more of your decisions than you realize. This isn\'t immaturity — it\'s a sign that some part of you is still waiting to be seen.', advice: 'You don\'t need to grow up faster. You need to parent yourself the way you deserved to be parented. Safety first. Then the feelings get quieter.', youProbably: ['Take things very personally', 'Need reassurance after any sign of distance', 'Feel emotions in your body — stomach drops, chest tightness', 'Have a younger voice that speaks loudest when tired or scared'] },
      teen: { emoji: '⚡', title: 'The Rebel', tagline: 'proving, pushing, performing — always', desc: 'You\'re in the era of proving yourself. To the world, to doubters, maybe to yourself. There\'s a restless energy — achievement feels urgent, rest feels lazy, and identity is still something you\'re building in real time.', advice: 'You don\'t have to earn your place. You\'re already here. The grinding, the proving — it\'s exhausting because it\'s not sustainable. Stop performing and still be valued.', youProbably: ['Compare yourself to people constantly', 'Struggle to sit still without productivity guilt', 'Have a harsh inner critic that sounds like someone from your past', 'Alternate between overconfidence and deep self-doubt'] },
      adult: { emoji: '🌿', title: 'The Grounded One', tagline: 'you feel it, name it, and choose what to do', desc: 'You can hold difficult emotions without drowning. You communicate, reflect, and take responsibility without collapsing into guilt. You\'re not perfect, but you\'re present.', advice: 'Don\'t let emotional maturity become emotional suppression. Grounded doesn\'t mean numb. Keep making room for messiness — that\'s where aliveness lives.', youProbably: ['Apologize without needing the other person to apologize first', 'Hold space for others without losing yourself', 'Recognize childhood patterns without being ruled by them', 'Feel proud of how far you\'ve come, quietly'] },
      elder: { emoji: '🦉', title: 'The Wise Observer', tagline: 'you\'ve stopped fighting the river', desc: 'You see the bigger picture. Emotions arrive and you watch them instead of becoming them. There\'s a calm from having survived enough storms to know: this too passes. People are drawn to your presence because it feels like rest.', advice: 'Don\'t detach so far that you stop feeling. Wisdom without warmth becomes distance. Stay close to people who still surprise you.', youProbably: ['Rarely feel urgency about things that used to destroy you', 'Give advice that lands because you\'ve earned it', 'Feel occasional loneliness from being emotionally "ahead"', 'Value peace over passion — and sometimes miss the fire'] },
    }
  },
  boundaries: {
    traits: ['porous', 'passive', 'healthy', 'rigid'],
    results: {
      porous: { emoji: '🫗', title: 'Porous Boundaries', tagline: 'you let everyone in — and it costs you', desc: 'You absorb other people\'s emotions, take on their problems, and struggle to tell where you end and someone else begins. Saying no feels like a betrayal. You over-share, over-give, and then wonder why you feel hollow.', advice: 'A boundary isn\'t a wall — it\'s a filter. Start with one small "no" this week. The discomfort fades but the self-respect doesn\'t.', youProbably: ['Feel responsible for other people\'s emotions', 'Over-share personal details with strangers', 'Attract people who take more than they give', 'Feel guilty for having needs'] },
      passive: { emoji: '😶', title: 'Passive Boundaries', tagline: 'you know what you need — you just can\'t say it', desc: 'You have the words. You even rehearse them in the shower. But in the moment, they dissolve. You hint, you hope, you swallow. The boundary exists inside you — it just hasn\'t made it to your mouth yet.', advice: 'Start with low-stakes situations. Text the boundary before saying it face-to-face. Every rep makes the next one easier. Your voice deserves volume.', youProbably: ['Say "it\'s fine" when it absolutely is not', 'Rehearse confrontations that never happen', 'Build resentment silently until you explode', 'Feel surprised when people cross lines you never voiced'] },
      healthy: { emoji: '💚', title: 'Healthy Boundaries', tagline: 'you can love and still say no', desc: 'You\'ve learned — maybe the hard way — that protecting your energy isn\'t selfish. You say no without cruelty, yes without resentment, and hold space without losing yourself.', advice: 'Boundaries are muscles, not achievements. They need maintenance. Watch for situations where old patterns creep back — usually with the people who matter most.', youProbably: ['Leave conversations feeling intact', 'Disagree without it becoming a crisis', 'Know when to engage and when to walk away', 'Attract people who respect your space because you model it'] },
      rigid: { emoji: '🧱', title: 'Rigid Boundaries', tagline: 'the walls work — but they\'re lonely', desc: 'You built your defenses for a reason, and they work. Almost too well. People can\'t hurt you, but they also can\'t reach you. Intimacy feels like a security risk, and vulnerability is a door you sealed shut.', advice: 'The walls kept you safe once. Ask yourself if they still need to be this high, or if they\'re protecting you from a threat that\'s no longer there.', youProbably: ['Cut people off cleanly and quickly', 'Prefer independence over connection when stressed', 'Have very few close relationships', 'Feel proud of needing no one — and sometimes empty because of it'] },
    }
  },
  selfsabotage: {
    traits: ['doom', 'unworthiness', 'perfectionism', 'impostor'],
    results: {
      doom: { emoji: '🌪️', title: 'The Doom Pattern', tagline: 'you leave before the leaving happens to you', desc: 'Somewhere along the way, you learned that good things end — and it\'s better to brace than to trust. So you pull away, self-destruct, or wait for the crash. It\'s not pessimism. It\'s preemptive grief.', advice: 'You\'re time-traveling to a pain that hasn\'t happened yet. Try staying in the present — even if it feels dangerously good. Not every good thing is a setup.', youProbably: ['Mentally prepare for breakups during happy moments', 'Leave jobs or cities before they can disappoint you', 'Feel suspicious when life is calm', 'Say "I knew it" when things go wrong, like you predicted it'] },
      unworthiness: { emoji: '🪫', title: 'The Unworthiness Pattern', tagline: 'you dim yourself so the light doesn\'t scare you', desc: 'You sabotage because deep down, you believe you don\'t deserve the good thing. So you make yourself small, give it away, or let it slip — because keeping it feels like stealing.', advice: 'You don\'t need to earn your place at the table. You were invited. Start treating yourself like someone whose happiness matters.', youProbably: ['Deflect compliments like they\'re attacks', 'Give away credit for your own work', 'Feel uncomfortable when things are going well', 'Believe other people deserve things more'] },
      perfectionism: { emoji: '🔬', title: 'The Perfectionism Pattern', tagline: 'nothing is ever finished because nothing is ever enough', desc: 'You don\'t procrastinate from laziness — you procrastinate from fear. If it\'s not perfect, it reflects on your worth. So you tweak, redo, delay, and polish until the deadline forces a release you\'re never happy with.', advice: 'Perfectionism isn\'t high standards — it\'s fear of being seen as flawed. Done is better than perfect. Ship it. The people who love you aren\'t grading you.', youProbably: ['Spend 3 hours on an email that takes 10 minutes', 'Feel physical discomfort at "good enough"', 'Criticize your own work before anyone else can', 'Have unfinished projects everywhere'] },
      impostor: { emoji: '🎪', title: 'The Impostor Pattern', tagline: 'everyone else belongs here — you just snuck in', desc: 'You look around and see people who know what they\'re doing. Then you look at yourself and see a convincing act. Every success is luck, every compliment a mistake, and every room one question away from exposure.', advice: 'The impostor feeling is, ironically, a sign that you care about quality and truth. The actual impostors don\'t feel this way. Your seat is yours. Sit in it.', youProbably: ['Over-prepare for everything because winging it feels dangerous', 'Attribute success to timing, luck, or other people', 'Feel anxious in rooms of "more qualified" people', 'Keep waiting for the day someone calls you out'] },
    }
  },
  // Character archetype decks
  hisarchetype: {
    traits: ['golden_retriever', 'dark_academic', 'mysterious_poet', 'chaos_king'],
    results: {
      golden_retriever: { emoji: '🐕', title: 'Golden Retriever', tagline: 'warm, loyal, and impossibly sweet', desc: 'He\'s the one who drops everything when you need him. He remembers the small things — your coffee order, the song you hummed once, the way you like your pillows. His love is loud, consistent, and feels like sunlight.', advice: 'He gives so much that he sometimes forgets to ask for what he needs. Don\'t let his warmth make you forget he has storms too.', youProbably: ['Get "good morning" texts every single day', 'Feel like the most important person in the room when he looks at you', 'Know he\'d apologize first even when he\'s right', 'Catch him smiling at you when he thinks you\'re not looking'] },
      dark_academic: { emoji: '📚', title: 'Dark Academic', tagline: 'quiet depth wrapped in sharp intellect', desc: 'He\'s the one who brings you books instead of flowers, who debates philosophy at midnight, and whose silence says more than most people\'s words. His love is thoughtful, intentional, and sometimes hard to decode — but when it lands, it hits deep.', advice: 'His need for space isn\'t distance — it\'s how he processes. Don\'t mistake his quiet for coldness; he\'s feeling everything, just internally.', youProbably: ['Have the most interesting conversations at 2am', 'Receive song or book recommendations that feel like love letters', 'Notice he observes everything but shares selectively', 'Feel intellectually challenged in the best way'] },
      mysterious_poet: { emoji: '🌙', title: 'Mysterious Poet', tagline: 'he feels everything and turns it into art', desc: 'He\'s the one who writes you letters he\'ll never send, who sees beauty in things others miss, and whose inner world is richer than most people will ever know. His love is deep, quiet, and expressed in ways that catch you off guard.', advice: 'He needs to be seen for who he really is, not who you imagine him to be. Give him space to be messy — not every feeling needs to be poetic.', youProbably: ['Find handwritten notes in unexpected places', 'Feel like he understands parts of you no one else reaches', 'Notice he disappears sometimes — then comes back with something beautiful', 'Know his playlist is basically a diary of your relationship'] },
      chaos_king: { emoji: '⚡', title: 'Chaos King', tagline: 'life is never boring with him in it', desc: 'He\'s the one who turns a grocery run into an adventure, who makes you laugh until you cry, and whose energy is so contagious it rewires your whole mood. His love is loud, unpredictable, and never, ever dull.', advice: 'Behind the chaos is someone who\'s terrified of stillness — because stillness means sitting with feelings. Let him know it\'s safe to be quiet with you.', youProbably: ['Have the wildest stories that all start with "so he had this idea..."', 'Laugh harder with him than with anyone else', 'Feel like every day is different when he\'s around', 'Know that under the jokes, he cares more than he lets on'] },
    }
  },
  girlfriendera: {
    traits: ['main_character', 'healer', 'ride_or_die', 'soft_villain'],
    results: {
      main_character: { emoji: '👑', title: 'Main Character', tagline: 'the world revolves around your energy', desc: 'You walk into a room and the vibe shifts. You set the pace, curate the aesthetic, and lead with confidence that others admire (and sometimes envy). Your love story isn\'t a side plot — it\'s the whole movie.', advice: 'Your light is magnetic, but make sure the spotlight has room for two. The best love stories have a co-lead, not an audience.', youProbably: ['Plan dates that feel like movie scenes', 'Have an aesthetic that people screenshot', 'Set the tone in every group chat and friend circle', 'Know exactly what you want — and refuse to settle for less'] },
      healer: { emoji: '🌿', title: 'The Healer', tagline: 'you love so deeply it becomes medicine', desc: 'You\'re the one people come to when they\'re broken. You listen without judgment, hold space without flinching, and love with a patience that borders on supernatural. Your presence alone makes people feel safe.', advice: 'You pour so much into others that your cup runs dry. Healing isn\'t your job in a relationship — it\'s something you both do for each other.', youProbably: ['Know exactly what someone needs before they say it', 'Attract people who need fixing (and sometimes forget to fix yourself)', 'Have friends who say "I don\'t know what I\'d do without you"', 'Feel responsible for everyone\'s emotional wellbeing'] },
      ride_or_die: { emoji: '🔥', title: 'Ride or Die', tagline: 'your loyalty is legendary and unbreakable', desc: 'When you love someone, you love them with everything. 3am calls, across-town drives, no questions asked. Your commitment isn\'t conditional — it\'s a promise you keep even when it costs you.', advice: 'Loyalty without boundaries becomes self-sacrifice. Make sure the people you\'d go to war for would do the same for you.', youProbably: ['Show up for people even when they don\'t ask', 'Have a small circle but would die for every person in it', 'Go from zero to "I\'ll fight them" in seconds when someone hurts your person', 'Love with an intensity that scares people who aren\'t ready for it'] },
      soft_villain: { emoji: '🖤', title: 'Soft Villain', tagline: 'mysterious, magnetic, and unapologetically yourself', desc: 'You\'re the one they can\'t figure out — and that\'s the point. You test people, keep them guessing, and only let in those who prove they can handle your full complexity. Your love isn\'t easy, but it\'s unforgettable.', advice: 'Not everything has to be a test. Sometimes the bravest thing isn\'t keeping people guessing — it\'s letting them stay.', youProbably: ['Have an energy that people are drawn to but can\'t explain', 'Give the hard truth when everyone else is sugarcoating', 'Keep people at arm\'s length until they\'ve earned your trust', 'Love fiercely but leave before you get left'] },
    }
  },
  couplestory: {
    traits: ['soulmates', 'adventure_duo', 'chaos_couple', 'slow_burn'],
    results: {
      soulmates: { emoji: '✨', title: 'Soulmates', tagline: 'written in the stars before you even met', desc: 'Your connection feels cosmic — like you\'ve known each other in a past life, or were always meant to collide. You finish each other\'s sentences, feel each other\'s moods, and have a bond that makes other people believe in fate.', advice: 'Destiny brought you together, but choice keeps you there. Don\'t coast on "meant to be" — keep actively choosing each other every day.', youProbably: ['Say the same thing at the same time constantly', 'Have friends who say "you two are disgusting" (lovingly)', 'Feel like home is a person, not a place', 'Know what the other is thinking with just a look'] },
      adventure_duo: { emoji: '🗺️', title: 'Adventure Duo', tagline: 'your love story is a highlight reel', desc: 'You two don\'t just exist together — you experience the world together. Every trip, every spontaneous plan, every "what if we just...?" is another chapter. Your relationship lives in motion.', advice: 'Adventures are beautiful, but so is stillness. Make sure you can sit in silence together without needing the next thrill to feel connected.', youProbably: ['Have more travel photos together than normal photos', 'Plan your next adventure before the current one is over', 'Bond deepest during chaotic, unplanned moments', 'Feel most alive when you\'re exploring something new together'] },
      chaos_couple: { emoji: '🎪', title: 'Chaos Couple', tagline: 'it shouldn\'t work but it absolutely does', desc: 'You two are the couple that makes no sense on paper but perfect sense in real life. The fights are loud, the love is louder, and your inside jokes need a glossary. It\'s messy, magnetic, and no one else could survive it.', advice: 'Chaos is fun until it\'s not. Learn to tell the difference between passion and patterns that need breaking. The best chaos has a safe landing.', youProbably: ['Have a relationship that confuses outsiders', 'Go from arguing to laughing in under 5 minutes', 'Have inside jokes that would take 30 minutes to explain', 'Know that boring was never an option for you two'] },
      slow_burn: { emoji: '🕯️', title: 'Slow Burn', tagline: 'the love that was worth the wait', desc: 'You didn\'t rush into this — and that\'s what makes it real. Built on friendship, trust, and a thousand small moments that added up to something undeniable. Your love story isn\'t loud, but it\'s deep.', advice: 'Your patience is your superpower. Just make sure "taking it slow" doesn\'t become "avoiding vulnerability." The deepest love requires the deepest risk.', youProbably: ['Were friends for a suspiciously long time before anything happened', 'Have a love story that makes people say "finally!"', 'Feel more secure in this relationship than any you\'ve had', 'Value the quiet moments more than the grand gestures'] },
    }
  },
  whathehides: {
    traits: ['hopeless_romantic', 'secret_overthinker', 'soft_protector', 'guarded_dreamer'],
    results: {
      hopeless_romantic: { emoji: '💘', title: 'Hopeless Romantic', tagline: 'he loves harder than he\'ll ever let you see', desc: 'Behind every casual "yeah it was cool" is a man who replayed every second of your last date. He imagines futures, saves your photos, and falls asleep thinking about your laugh. He\'s not playing it cool — he\'s terrified of how much he feels.', advice: 'He needs to know that loving openly won\'t scare you away. Show him that his tenderness is strength, not weakness — and that you want all of it.', youProbably: ['Catch him looking at you with an expression he\'d deny', 'Find out he remembers things you said months ago', 'Notice he plans things for "someday" that include you', 'Know he loves you more than his words can carry'] },
      secret_overthinker: { emoji: '🧠', title: 'Secret Overthinker', tagline: 'his mind never stops running scenarios', desc: 'He\'s replaying your last conversation at 3am, analyzing your tone, and wondering if that emoji meant something different. He\'s not anxious — he\'s deeply invested and terrified of getting it wrong. Every silence feels like a clue he needs to decode.', advice: 'Reassurance isn\'t clingy — for him, it\'s oxygen. A simple "we\'re good" can quiet the noise in his head for days. Be direct, not vague.', youProbably: ['Get carefully worded texts that he rewrote four times', 'Notice he picks up on mood shifts before you mention them', 'Know he\'s already thought of every possible outcome', 'Feel like he\'s always one step ahead — because he is, in his head'] },
      soft_protector: { emoji: '🛡️', title: 'Soft Protector', tagline: 'he carries weight you\'ll never know about', desc: 'He walks on the traffic side of the sidewalk. He checks if you\'ve eaten. He stays calm in chaos so you don\'t have to be scared. His love isn\'t loud — it\'s structural. He builds safety around you without ever asking for credit.', advice: 'He needs to know that protecting you doesn\'t mean carrying everything alone. Let him be soft too. He\'s been strong for so long he forgot he\'s allowed to rest.', youProbably: ['Feel inexplicably safe when he\'s around', 'Notice he handles problems before you even know they exist', 'Know he puts your comfort above his own — always', 'See him carry stress silently and wish he\'d let you help'] },
      guarded_dreamer: { emoji: '🔐', title: 'Guarded Dreamer', tagline: 'he wants to let you in but the walls are high', desc: 'He has a whole world inside him — dreams, fears, tenderness — but it\'s behind a door he rarely opens. He wants to be vulnerable with you. He\'s just been burned enough to know that openness has a price, and he\'s still deciding if it\'s safe to pay it.', advice: 'Don\'t force the door. Show him through consistency — not just words — that you\'re not going anywhere. The day he opens up will be worth every patient moment.', youProbably: ['Feel like you\'re always almost seeing the real him', 'Notice him start to open up then pull back', 'Know there\'s more beneath the surface than he shows anyone', 'Catch small moments of vulnerability he quickly covers up'] },
    }
  },
};

function buildSoloReceipt() {
  // Tally trait scores (handles both single and multi-select answers)
  const scores = {};
  questions.forEach((q, i) => {
    const raw = selectedAnswers[i];
    if (raw == null || !q.traits) return;
    const indices = Array.isArray(raw) ? raw : [raw];
    indices.forEach(ansIdx => {
      const traitMap = q.traits[ansIdx];
      if (!traitMap) return;
      Object.entries(traitMap).forEach(([trait, val]) => {
        scores[trait] = (scores[trait] || 0) + val;
      });
    });
  });

  // Get pack result definitions
  const packResult = soloResultDefs[selectedPackKey];
  if (!packResult) { buildReceipt(); return; } // fallback

  // Find dominant trait
  const sortedTraits = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const dominantKey = sortedTraits[0]?.[0] || packResult.traits[0];
  const result = packResult.results[dominantKey];
  const totalScore = sortedTraits.reduce((sum, [, v]) => sum + v, 0) || 1;

  // Build trait breakdown bars
  let breakdownHtml = '';
  sortedTraits.forEach(([trait, val]) => {
    const pct = Math.round((val / totalScore) * 100);
    const r = packResult.results[trait];
    if (!r) return;
    breakdownHtml += `
      <div class="solo-trait-bar">
        <div class="solo-trait-header">
          <span class="solo-trait-emoji">${r.emoji}</span>
          <span class="solo-trait-name">${r.title}</span>
          <span class="solo-trait-pct">${pct}%</span>
        </div>
        <div class="solo-bar-track">
          <div class="solo-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  });

  // Build answer review
  let answersHtml = '';
  questions.forEach((q, i) => {
    const raw = selectedAnswers[i];
    const ansText = raw != null ? (Array.isArray(raw) ? raw.map(idx => q.options[idx]).join(', ') : q.options[raw]) : '—';
    answersHtml += `
      <div class="story-chapter">
        <div class="ch-num">${i + 1} ${i18n.t('results_of')} ${questions.length}</div>
        <div class="ch-question">${q.q}</div>
        <div class="ch-answers">
          <div class="ch-ans ch-you" style="flex:1">
            <div class="ch-label">${i18n.t('results_you')}</div>
            <div class="ch-text">${ansText}</div>
          </div>
        </div>
      </div>
    `;
  });

  // "You probably" list (if available)
  let youProbablyHtml = '';
  if (result.youProbably && result.youProbably.length) {
    youProbablyHtml = `
      <div class="solo-youprobably glass">
        <div class="solo-youprobably-title">${i18n.t('solo_you_probably')}</div>
        ${result.youProbably.map(item => `<div class="solo-yp-item"><span class="solo-yp-dot"></span>${item}</div>`).join('')}
      </div>
    `;
  }

  const packDef = packDefs.find(p => p.key === selectedPackKey);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const taglineHtml = result.tagline ? `<div class="solo-tagline">${result.tagline}</div>` : '';

  const scroll = document.getElementById('storyScroll');
  scroll.innerHTML = `
    <div class="story-hero">
      <div class="story-hero-top">
        <div class="story-hero-emoji">${result.emoji}</div>
      </div>
      <div class="story-hero-vibe">${result.title}</div>
      ${taglineHtml}
      <div class="story-hero-sub">${i18n.t(packDef.nameKey)}</div>
      <div class="story-hero-names"><span class="solo-badge-tag">${i18n.t('solo_badge')}</span></div>
    </div>
    <div class="story-intro"><p>${result.desc}</p></div>
    ${youProbablyHtml}
    <div class="solo-advice-card glass">
      <div class="solo-advice-label">${i18n.t('solo_note_to_self')}</div>
      <div class="solo-advice-text">${result.advice}</div>
    </div>
    <div class="solo-breakdown-section">
      <div class="solo-breakdown-title">${i18n.t('solo_breakdown')}</div>
      ${breakdownHtml}
    </div>
    ${answersHtml}
    <div class="story-outro">
      <div class="story-brand">blindside.</div>
      <div class="story-date">${dateStr}</div>
    </div>
    <div class="story-actions">
      <button class="btn-share" onclick="shareReceipt()">${i18n.t('results_share')}</button>
      <button class="btn btn-primary" style="width:100%" onclick="goTo('packs')">${i18n.t('solo_take_another')}</button>
      <button class="btn btn-ghost" onclick="goTo('home')">${i18n.t('results_back_home')}</button>
    </div>
  `;
  scroll.scrollTop = 0;
  spawnConfetti();
}

function buildReceipt() {
  const data = revealData.length ? revealData : questions.map((q, i) => {
    const raw = selectedAnswers[i];
    const partnerIdx = q.partnerAnswerIndex;
    let userAns, matched;
    if (Array.isArray(raw)) {
      userAns = raw.map(idx => q.options[idx]).join(', ');
      matched = raw.includes(partnerIdx);
    } else {
      const userIdx = raw != null ? raw : 0;
      userAns = q.options[userIdx];
      matched = userIdx === partnerIdx;
    }
    return { q: q.q, userAns, partnerAns: q.options[partnerIdx], matched };
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
      // Show guest-friendly auth for invite links
      goTo('guestAuth');
      setTimeout(() => document.getElementById('guestName')?.focus(), 300);
    }
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  } else if (currentUser) {
    // Auto-login: skip splash, go to home
    goTo('home');
  }
})();
