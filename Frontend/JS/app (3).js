/* ================================================================
   SMART IOT DOORBELL — app.js
   Auth via PostgreSQL API · localStorage for session only
   ================================================================ */

'use strict';
const API_BASE = 'http://127.0.0.1:5000';

/* ── STORAGE KEYS ── */
const KEYS = {
  user:         'db_user',        // { id, name, email, phone, photo }  — session only
  loggedin:     'db_loggedin',
  pendingEmail: 'db_pending_email',
  profiles:     'db_profiles',
  selProfile:   'db_selected_profile',
  visitors:     'db_visitors',
  selVisitor:   'db_selected_visitor',
  notifs:       'db_notifications',
  dnd:          'db_dnd',
  theme:        'db_theme',
  voiceMsgs:    'db_voice_messages',
};

/* ── HELPERS ── */
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function now() {
  const d = new Date();
  return {
    iso:   d.toISOString(),
    date:  d.toISOString().split('T')[0],
    time:  d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    label: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) + ' – ' +
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function get(key)    { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function set(key, v) { localStorage.setItem(key, JSON.stringify(v)); }

/* ── DATA URL TO BLOB ── */
function dataURLtoBlob(dataURL) {
  const arr  = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

/* ── TOAST ── */
let toastTimer;
function showToast(msg, type = '') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = type;
  clearTimeout(toastTimer);
  el.classList.add('show');
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ── CLOCK ── */
function startClock(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const tick = () => el.textContent = new Date().toLocaleTimeString();
  tick(); setInterval(tick, 1000);
}

/* ── DEFAULT AVATAR ── */
const DEFAULT_PHOTO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%231e293b'/%3E%3Ccircle cx='50' cy='37' r='20' fill='%23334155'/%3E%3Cellipse cx='50' cy='88' rx='34' ry='24' fill='%23334155'/%3E%3C/svg%3E";

/* ================================================================
   THEME
   ================================================================ */
function applyTheme() {
  const theme = get(KEYS.theme) || 'dark';
  document.body.classList.toggle('light', theme === 'light');
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.classList.toggle('on', theme === 'light');
}

function toggleTheme() {
  const cur  = get(KEYS.theme) || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  set(KEYS.theme, next);
  applyTheme();
  showToast(next === 'light' ? 'Light mode on' : 'Dark mode on');
}

/* ================================================================
   AUTHENTICATION  — backed by PostgreSQL via Flask API
   ================================================================ */

/**
 * POST /signup
 * Creates account in PostgreSQL, then redirects to verify.html.
 */
async function signup() {
  const name     = document.getElementById('name')?.value.trim();
  const email    = document.getElementById('email')?.value.trim();
  const phone    = document.getElementById('phone')?.value.trim();
  const password = document.getElementById('password')?.value;
  const confirm  = document.getElementById('confirmPassword')?.value;

  if (!name || !email || !password)       { showToast('Please fill all required fields', 'error'); return; }
  if (!/\S+@\S+\.\S+/.test(email))        { showToast('Enter a valid email address', 'error'); return; }
  if (confirm !== undefined && password !== confirm) { showToast('Passwords do not match', 'error'); return; }

  try {
    const res  = await fetch(API_BASE + '/signup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, phone: phone || '', password }),
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || 'Signup failed', 'error');
      return;
    }

    // Store pending email for the verify page display, user for session
    set(KEYS.pendingEmail, email);
    set(KEYS.user, { ...data.user, photo: '' });
    showToast('Account created — verify your email!', 'success');
    setTimeout(() => window.location.href = 'verify.html', 1100);
  } catch (err) {
    console.error(err);
    showToast('Could not reach server. Is Flask running?', 'error');
  }
}

/**
 * Verify OTP (demo — code is always 1234).
 */
function verifyOTP() {
  const otp = document.getElementById('otp')?.value.trim();
  if (otp === '1234') {
    set(KEYS.loggedin, true);
    showToast('Email verified!', 'success');
    setTimeout(() => window.location.href = 'index.html', 1000);
  } else {
    showToast('Wrong OTP. Hint: 1234', 'error');
    document.getElementById('otp').value = '';
    document.getElementById('otp').focus();
  }
}

/**
 * POST /login
 * Verifies credentials against PostgreSQL, saves session to localStorage.
 */
async function login() {
  const email    = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;

  if (!email || !password) { showToast('Enter your email and password', 'error'); return; }

  try {
    const res  = await fetch(API_BASE + '/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || 'Invalid email or password', 'error');
      return;
    }

    // Preserve any locally-saved photo between sessions
    const existing = get(KEYS.user) || {};
    set(KEYS.user, { ...data.user, photo: existing.photo || '' });
    set(KEYS.loggedin, true);
    showToast('Welcome back, ' + data.user.name + '!', 'success');
    setTimeout(() => window.location.href = 'profile.html', 900);
  } catch (err) {
    console.error(err);
    showToast('Could not reach server. Is Flask running?', 'error');
  }
}

function logout() {
  localStorage.removeItem(KEYS.loggedin);
  localStorage.removeItem(KEYS.selProfile);
  showToast('Logged out');
  setTimeout(() => window.location.href = 'index.html', 700);
}

/* ================================================================
   PROFILE SELECTION
   ================================================================ */
const EMOJIS = ['👤','🧑','👩','👨','🧒','👧','🧔','👱','🧓','👴'];

function getProfiles() { return get(KEYS.profiles) || []; }

function loadProfiles() {
  const container = document.getElementById('profiles');
  if (!container) return;
  const profiles = getProfiles();
  container.innerHTML = '';

  profiles.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.style.animationDelay = (i * 0.07) + 's';
    card.innerHTML = `
      <div class="profile-avatar">${p.emoji}</div>
      <div class="p-name">${escHtml(p.name)}</div>
      <button class="profile-del" onclick="event.stopPropagation();deleteProfile('${p.id}')">Remove</button>
    `;
    card.addEventListener('click', () => { set(KEYS.selProfile, p); window.location.href = 'dashboard.html'; });
    container.appendChild(card);
  });

  const add = document.createElement('div');
  add.className = 'add-profile-card';
  add.innerHTML = `<span class="plus">＋</span><span>Add Profile</span>`;
  add.onclick = () => openModal('add-profile-modal');
  container.appendChild(add);
}

function addProfile() {
  const nameEl = document.getElementById('new-profile-name');
  const name   = nameEl?.value.trim();
  if (!name) { showToast('Enter a profile name', 'error'); return; }
  const profiles = getProfiles();
  profiles.push({ id: genId(), name, emoji: EMOJIS[profiles.length % EMOJIS.length] });
  set(KEYS.profiles, profiles);
  closeModal('add-profile-modal');
  nameEl.value = '';
  loadProfiles();
  showToast('"' + name + '" added', 'success');
}

function deleteProfile(id) {
  const profiles = getProfiles().filter(p => p.id !== id);
  set(KEYS.profiles, profiles);
  loadProfiles();
  showToast('Profile removed');
}

/* ================================================================
   VISITOR LOG
   ================================================================ */
function getVisitors() { return get(KEYS.visitors) || []; }

function addVisitor(name, photo, status) {
  const visitors = getVisitors();
  const t = now();

  const existing = visitors.find(v => v.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    existing.history.unshift({ date: t.date, time: t.time, label: t.label });
    existing.date = t.date;
    existing.time = t.time;
    if (photo) existing.photo = photo;
    set(KEYS.visitors, existing);
    addNotification('🔔', 'Returning visitor: ' + name, t.label);
    return existing;
  } else {
    const v = {
      id: genId(), name,
      photo:   photo || DEFAULT_PHOTO,
      status:  status || 'unknown',
      date:    t.date,
      time:    t.time,
      history: [{ date: t.date, time: t.time, label: t.label }],
    };
    visitors.unshift(v);
    set(KEYS.visitors, visitors);
    addNotification('📸', 'Visitor captured: ' + name, t.label);
    return v;
  }
}

/* ================================================================
   VOICE MESSAGE STORAGE
   ================================================================ */
function getVoiceMessages() { return get(KEYS.voiceMsgs) || {}; }

function saveVoiceMessage(visitorId, dataUrl) {
  const msgs = getVoiceMessages();
  msgs[visitorId] = dataUrl;
  set(KEYS.voiceMsgs, msgs);
}

function getVoiceMessage(visitorId) {
  const msgs = getVoiceMessages();
  return msgs[visitorId] || null;
}

function deleteVoiceMessage(visitorId) {
  const msgs = getVoiceMessages();
  delete msgs[visitorId];
  set(KEYS.voiceMsgs, msgs);
}

/* ================================================================
   DASHBOARD
   ================================================================ */
let dashState = { tab: 'all', search: '', date: '' };

async function loadDashboard() {
  const container = document.getElementById('visitorList');
  if (!container) return;

  try {
    const res      = await fetch(API_BASE + '/visitors');
    const visitors = await res.json();

    let filtered = visitors;

    if (dashState.tab === 'known')   filtered = filtered.filter(v => v.type === 'Known');
    if (dashState.tab === 'unknown') filtered = filtered.filter(v => v.type !== 'Known');
    if (dashState.search) filtered = filtered.filter(v => v.name.toLowerCase().includes(dashState.search.toLowerCase()));
    if (dashState.date)   filtered = filtered.filter(v => v.time && v.time.startsWith(dashState.date));

    const countEl = document.getElementById('visitor-count');
    if (countEl) countEl.textContent = filtered.length + (filtered.length === 1 ? ' visitor' : ' visitors');

    container.innerHTML = '';

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><h3>No visitors yet</h3><p>USE LIVE FEED TO CAPTURE YOUR FIRST VISITOR</p></div>';
      return;
    }

    filtered.forEach((v, i) => {
      const isKnown = v.type === 'Known';
      const sc  = isKnown ? 'var(--green)'  : 'var(--yellow)';
      const sb  = isKnown ? 'status-known'  : 'status-unknown';
      const sl  = isKnown ? 'Known'         : 'Unknown';
      const imageUrl = v.image ? API_BASE + '/images/' + v.image : '';
      const ph  = imageUrl ? '<img src="' + imageUrl + '" alt="' + escHtml(v.name) + '">' : '👤';
      const hasVoice = !!getVoiceMessage(v.id);

      const row = document.createElement('div');
      row.className = 'visitor-row';
      row.style.cssText = 'animation-delay:' + (i * 0.04) + 's; --status-color:' + sc + ';';
      let html = '<div class="visitor-photo">' + ph + '</div>';
      html += '<div class="visitor-info">';
      html += '<div class="visitor-name">' + escHtml(v.name) + '</div>';
      html += '<div class="visitor-meta">';
      html += '<span>📅 ' + fmtDate(v.time) + '</span>';
      html += '<span>🕐 ' + (v.time ? v.time.split(' ')[1] : 'N/A') + '</span>';
      html += '<span>📋 ' + v.visits + ' visit' + (v.visits !== 1 ? 's' : '') + '</span>';
      html += '</div>';
      if (hasVoice) html += '<div class="voice-indicator">🎤 Voice Message Left</div>';
      html += '</div>';
      html += '<div class="visitor-actions"><span class="status-badge ' + sb + '">' + sl + '</span></div>';
      row.innerHTML = html;
      row.addEventListener('click', () => { set(KEYS.selVisitor, v); window.location.href = 'visitor.html'; });
      container.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div style="color:red;padding:20px;">Failed to load visitors</div>';
  }
}

function searchVisitor() {
  dashState.search = document.getElementById('search')?.value || '';
  loadDashboard();
}

function filterDate() {
  dashState.date = document.getElementById('dateFilter')?.value || '';
  const clearBtn = document.getElementById('clear-date');
  if (clearBtn) clearBtn.style.display = dashState.date ? 'block' : 'none';
  loadDashboard();
}

function clearDateFilter() {
  dashState.date = '';
  const df = document.getElementById('dateFilter');
  if (df) df.value = '';
  const clearBtn = document.getElementById('clear-date');
  if (clearBtn) clearBtn.style.display = 'none';
  loadDashboard();
}

function setTab(tab) {
  dashState.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  loadDashboard();
}

function openVisitorProfile(v) {
  set(KEYS.selVisitor, v);
  window.location.href = 'visitor.html';
}

function loadHeaderAvatar() {
  const el = document.getElementById('header-avatar');
  if (!el) return;
  const user = get(KEYS.user);
  if (user?.photo) {
    el.innerHTML = '<img src="' + user.photo + '" alt="">';
  } else if (user?.name) {
    el.textContent = user.name[0].toUpperCase();
  }
}

/* ================================================================
   SETTINGS SIDEBAR
   ================================================================ */
function openSidebar() {
  document.getElementById('settings-sidebar')?.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.add('open');
  const dndEl   = document.getElementById('dnd-toggle');
  if (dndEl)   dndEl.classList.toggle('on', !!get(KEYS.dnd));
  const themeEl = document.getElementById('theme-toggle');
  if (themeEl) themeEl.classList.toggle('on', get(KEYS.theme) === 'light');
}

function closeSidebar() {
  document.getElementById('settings-sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
}

function toggleDoNotDisturb() {
  const cur = get(KEYS.dnd);
  set(KEYS.dnd, !cur);
  const el = document.getElementById('dnd-toggle');
  if (el) el.classList.toggle('on', !cur);
  showToast(!cur ? 'Do Not Disturb ON' : 'Do Not Disturb OFF');
}

/* ================================================================
   NOTIFICATIONS
   ================================================================ */
function getNotifs() { return get(KEYS.notifs) || []; }

function addNotification(icon, msg, time, desc) {
  if (get(KEYS.dnd)) return;
  const notifs = getNotifs();
  notifs.unshift({ id: genId(), icon, msg, desc: desc || '', time, read: false });
  if (notifs.length > 50) notifs.pop();
  set(KEYS.notifs, notifs);
  updateNotifBadge();
  const panel = document.getElementById('notif-panel');
  if (panel?.classList.contains('open')) loadNotifications();
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const unread = getNotifs().filter(n => !n.read).length;
  badge.textContent = unread > 9 ? '9+' : unread;
  badge.style.display = unread > 0 ? 'flex' : 'none';
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (isOpen) loadNotifications();
}

function loadNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  const notifs = getNotifs();

  if (notifs.length === 0) {
    list.innerHTML = '<div class="notif-empty">NO NOTIFICATIONS</div>';
    return;
  }

  list.innerHTML = notifs.map(n => {
    let cls  = n.read ? '' : 'unread';
    let html = '<div class="notif-item ' + cls + '">';
    html += '<div class="notif-icon">'    + n.icon + '</div>';
    html += '<div class="notif-content">';
    html += '<div class="notif-msg">'     + escHtml(n.msg)  + '</div>';
    if (n.desc) html += '<div class="notif-desc">' + escHtml(n.desc) + '</div>';
    html += '<div class="notif-time">'    + n.time + '</div>';
    html += '</div></div>';
    return html;
  }).join('');
}

function markAllRead() {
  const notifs = getNotifs().map(n => ({ ...n, read: true }));
  set(KEYS.notifs, notifs);
  updateNotifBadge();
  loadNotifications();
  showToast('All notifications read');
}

/* ================================================================
   LIVE FEED & CAPTURE
   ================================================================ */
let mediaStream   = null;
let mediaRecorder = null;
let audioChunks   = [];
let isRecording   = false;

function startVoiceRecording() {
  const btn    = document.getElementById('voice-record-btn');
  const status = document.getElementById('voice-record-status');

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      audioChunks   = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob   = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const modal = document.getElementById('capture-modal');
          if (modal) modal.dataset.voiceMessage = reader.result;
          if (status) { status.textContent = '✅ Message recorded'; status.className = 'voice-status recorded'; }
          const playbackDiv = document.getElementById('voice-playback');
          if (playbackDiv) {
            playbackDiv.innerHTML = '<audio controls src="' + reader.result + '" style="width:100%;margin-top:6px;"></audio>';
            playbackDiv.style.display = 'block';
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      isRecording = true;
      if (btn)    { btn.textContent = '⏹ Stop Recording'; btn.classList.add('recording'); }
      if (status) { status.textContent = '🔴 Recording...'; status.className = 'voice-status recording'; }
    })
    .catch(err => { console.error(err); showToast('Microphone access denied', 'error'); });
}

function stopVoiceRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    const btn = document.getElementById('voice-record-btn');
    if (btn) { btn.textContent = '🎤 Record Message'; btn.classList.remove('recording'); }
  }
}

function toggleVoiceRecording() {
  if (!isRecording) startVoiceRecording(); else stopVoiceRecording();
}

function clearVoiceRecording() {
  const modal = document.getElementById('capture-modal');
  if (modal) delete modal.dataset.voiceMessage;
  const playbackDiv = document.getElementById('voice-playback');
  if (playbackDiv) { playbackDiv.innerHTML = ''; playbackDiv.style.display = 'none'; }
  const status = document.getElementById('voice-record-status');
  if (status) { status.textContent = ''; status.className = 'voice-status'; }
  const btn = document.getElementById('voice-record-btn');
  if (btn) { btn.textContent = '🎤 Record Message'; btn.classList.remove('recording'); }
}

function startCamera() {
  const video = document.getElementById('video');
  const noSig = document.getElementById('no-signal');
  if (!video) return;

  navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    .then(stream => {
      mediaStream        = stream;
      video.srcObject    = stream;
      video.style.display = 'block';
      if (noSig) noSig.style.display = 'none';
      startClock('live-clock');
    })
    .catch(err => { console.error(err); showToast('Camera access denied or unavailable', 'error'); });
}

function stopCamera() {
  mediaStream?.getTracks().forEach(t => t.stop());
  mediaStream = null;
}

async function captureVisitor() {
  const video  = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  if (!video?.srcObject) { showToast('Camera not active', 'error'); return; }

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const photo = canvas.toDataURL('image/jpeg', 0.85);

  const formData = new FormData();
  formData.append('image', dataURLtoBlob(photo));

  try {
    const res  = await fetch(API_BASE + '/recognize', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.status === 'known') {
      if (data.type === 'Unknown') {
        addNotification('🔄', 'Recurring Unknown Visitor Detected', now().label, 'An unknown visitor has returned.');
        showToast('Recurring Unknown Visitor — This visitor has been detected before.');
      } else {
        addNotification('👋', 'Known Visitor Detected: ' + data.name, now().label, data.name + ' has been detected at the door.');
        showToast('Known Visitor Detected — ' + data.name + ' has been logged successfully.');
      }
    } else {
      addNotification('📸', 'New Unknown Visitor Detected', now().label, 'A new visitor was detected and added to the visitor log.');
      showToast('Unknown Visitor Captured — New unknown visitor saved to visitor log.');

      document.getElementById('capture-preview').src = photo;
      const modal = document.getElementById('capture-modal');
      modal.dataset.photo     = photo;
      modal.dataset.visitorId = data.visitor_id;
      delete modal.dataset.voiceMessage;
      document.getElementById('capture-name').value   = '';
      document.getElementById('capture-status').value = 'unknown';
      clearVoiceRecording();
      openModal('capture-modal');
    }
  } catch (err) {
    console.error(err);
    showToast('Recognition failed', 'error');
  }
}

function saveCapturedVisitor() {
  const modal       = document.getElementById('capture-modal');
  const name        = document.getElementById('capture-name').value.trim() || 'Unknown Visitor';
  const visitorId   = modal?.dataset.visitorId;
  const voiceDataUrl = modal?.dataset.voiceMessage || null;

  if (!visitorId) { showToast('No visitor ID', 'error'); return; }
  if (isRecording) stopVoiceRecording();

  (async () => {
    try {
      if (name !== 'Unknown Visitor') {
        const updateRes = await fetch(API_BASE + '/update_visitor', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ visitor_id: visitorId, name }),
        });
        if (!updateRes.ok) throw new Error('Update failed');
        addNotification('👤', 'Visitor identified: ' + name, now().label);
      } else {
        addNotification('👤', 'Unknown visitor logged', now().label);
      }
      if (voiceDataUrl) saveVoiceMessage(visitorId, voiceDataUrl);
      closeModal('capture-modal');
      showToast('Visitor captured!', 'success');
      setTimeout(() => loadDashboard(), 500);
    } catch (err) {
      console.error(err);
      showToast('Failed to save visitor', 'error');
    }
  })();
}

function backToDashboard() { stopCamera(); window.location.href = 'dashboard.html'; }
function openLive()        { window.location.href = 'livefeed.html'; }

/* ================================================================
   VISITOR PROFILE PAGE
   ================================================================ */
function loadVisitorProfilePage() {
  const v = get(KEYS.selVisitor);
  if (!v) { window.location.href = 'dashboard.html'; return; }

  setText('vp-name', v.name);
  setText('vp-time', fmtDate(v.time) + ' · ' + (v.time ? v.time.split(' ')[1] : 'N/A'));

  const nameEl = document.getElementById('edit-name');
  if (nameEl) nameEl.value = v.name;

  const statusEl = document.getElementById('vp-status');
  if (statusEl) {
    const isKnown = v.type === 'Known';
    statusEl.className   = 'status-badge ' + (isKnown ? 'status-known' : 'status-unknown');
    statusEl.textContent = isKnown ? 'Known' : 'Unknown';
  }

  const photoEl = document.getElementById('vp-photo');
  if (photoEl) {
    const imageUrl = v.image ? API_BASE + '/images/' + v.image : '';
    photoEl.innerHTML = imageUrl ? '<img src="' + imageUrl + '" alt="">' : '👤';
  }

  loadVoiceMessageSection(v.id);
  loadVisitorHistory(v.id);
}

function loadVoiceMessageSection(visitorId) {
  const section = document.getElementById('vp-voice-section');
  if (!section) return;
  const voiceDataUrl = getVoiceMessage(visitorId);

  if (voiceDataUrl) {
    section.innerHTML = `
      <h3>🎤 Voice Message</h3>
      <div class="voice-message-player">
        <div class="voice-message-label">▶ Play Message</div>
        <audio controls src="${voiceDataUrl}" style="width:100%;margin-top:10px;"></audio>
        <button class="btn btn-danger btn-sm" style="margin-top:12px;width:100%;" onclick="removeVoiceMessage('${visitorId}')">
          🗑 Delete Voice Message
        </button>
      </div>
    `;
  } else {
    section.innerHTML = `
      <h3>🎤 Voice Message</h3>
      <div class="voice-message-empty">No voice message left by this visitor.</div>
    `;
  }
}

function removeVoiceMessage(visitorId) {
  if (!confirm('Delete this voice message?')) return;
  deleteVoiceMessage(visitorId);
  loadVoiceMessageSection(visitorId);
  showToast('Voice message deleted');
}

async function loadVisitorHistory(visitorId) {
  const el = document.getElementById('vp-history');
  if (!el) return;

  try {
    const res     = await fetch(API_BASE + '/visitor/' + visitorId);
    const history = await res.json();

    if (!Array.isArray(history) || history.length === 0) {
      el.innerHTML = '<div style="padding:20px;color:#666;">No visit history</div>';
      return;
    }

    let html = '';
    history.forEach((h, i) => {
      html += '<div class="history-item" style="animation-delay:' + (i * 0.05) + 's">';
      html += '<div class="h-dot"></div><div>';
      html += '<div class="h-date">' + fmtDate(h.time) + '</div>';
      html += '<div class="h-time">' + (h.time ? h.time.split(' ')[1] : 'N/A') + '</div>';
      html += '</div></div>';
    });
    el.innerHTML = html;
  } catch (err) {
    console.error(err);
    el.innerHTML = '<div style="padding:20px;color:red;">Failed to load history</div>';
  }
}

async function saveVisitor() {
  const v       = get(KEYS.selVisitor);
  if (!v) return;
  const newName = document.getElementById('edit-name')?.value.trim();
  if (!newName) { showToast('Name cannot be empty', 'error'); return; }

  try {
    const res = await fetch(API_BASE + '/update_visitor', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ visitor_id: v.id, name: newName }),
    });
    if (!res.ok) throw new Error('Failed to update');

    v.name = newName;
    set(KEYS.selVisitor, v);
    addNotification('✏️', 'Visitor updated: ' + v.name, now().label);
    showToast('Visitor updated!', 'success');
    loadVisitorProfilePage();
  } catch (err) {
    console.error(err);
    showToast('Failed to update visitor', 'error');
  }
}

async function deleteVisitor() {
  const v = get(KEYS.selVisitor);
  if (!v) return;
  if (!confirm('Delete visitor "' + v.name + '"? This cannot be undone.')) return;

  try {
    const res = await fetch(API_BASE + '/delete_visitor/' + v.id, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    deleteVoiceMessage(v.id);
    addNotification('🗑️', 'Visitor deleted: ' + v.name, now().label);
    showToast('Visitor deleted');
    setTimeout(() => window.location.href = 'dashboard.html', 700);
  } catch (err) {
    console.error(err);
    showToast('Failed to delete visitor', 'error');
  }
}

function triggerVisitorPhotoUpload() { document.getElementById('photo-upload')?.click(); }

function previewVisitorPhoto() {
  const file = document.getElementById('photo-upload')?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const el = document.getElementById('vp-photo');
    if (el) el.innerHTML = '<img src="' + reader.result + '" alt="">';
  };
  reader.readAsDataURL(file);
}

/* ================================================================
   USER PROFILE PAGE
   Loads from backend (GET /user/<id>) on open,
   saves via PUT /user/<id>.
   Photo stays in localStorage (not stored on server).
   ================================================================ */
async function loadUserProfilePage() {
  const session = get(KEYS.user);
  if (!session) return;

  // Optimistically fill from session
  _fillUserProfileForm(session);

  // Refresh from backend
  try {
    const res  = await fetch(API_BASE + '/user/' + session.id);
    const data = await res.json();
    if (res.ok && data.user) {
      // Merge — keep local photo since backend doesn't store it
      const merged = { ...data.user, photo: session.photo || '' };
      set(KEYS.user, merged);
      _fillUserProfileForm(merged);
    }
  } catch (err) {
    console.error('Could not refresh profile from server:', err);
    // Silent fail — session data already shown
  }
}

function _fillUserProfileForm(user) {
  const nameEl  = document.getElementById('profileName');
  const phoneEl = document.getElementById('profilePhone');
  const emailEl = document.getElementById('profileEmail');
  const photoEl = document.getElementById('up-photo');
  if (nameEl)  nameEl.value  = user.name  || '';
  if (phoneEl) phoneEl.value = user.phone || '';
  if (emailEl) emailEl.value = user.email || '';
  if (photoEl) photoEl.innerHTML = user.photo
    ? '<img src="' + user.photo + '" alt="">'
    : (user.name?.[0]?.toUpperCase() || '?');
}

async function saveProfile() {
  const session = get(KEYS.user);
  if (!session) return;

  const name  = document.getElementById('profileName')?.value.trim()  || session.name;
  const phone = document.getElementById('profilePhone')?.value.trim() || '';

  try {
    const res  = await fetch(API_BASE + '/user/' + session.id, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, phone }),
    });
    const data = await res.json();

    if (!res.ok) { showToast(data.message || 'Save failed', 'error'); return; }

    // Update session
    const updated = { ...data.user, photo: session.photo || '' };
    set(KEYS.user, updated);
    showToast('Profile saved!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Could not reach server', 'error');
  }
}

function triggerProfilePhotoUpload() { document.getElementById('profilePhotoInput')?.click(); }

function changeProfilePhoto() {
  const file = document.getElementById('profilePhotoInput')?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const user = get(KEYS.user) || {};
    user.photo = reader.result;
    set(KEYS.user, user);
    const el = document.getElementById('up-photo');
    if (el) el.innerHTML = '<img src="' + reader.result + '" alt="">';
    showToast('Photo updated!', 'success');
  };
  reader.readAsDataURL(file);
}

/* ================================================================
   MODAL HELPERS
   ================================================================ */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); el.style.display = 'flex'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); el.style.display = 'none'; }
  if (id === 'capture-modal' && isRecording) stopVoiceRecording();
}

/* ================================================================
   MISC HELPERS
   ================================================================ */
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setText(id, text, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val !== undefined && el.tagName === 'INPUT') el.value = val;
  else if (text !== null) el.textContent = text;
}

/* ================================================================
   INIT — runs on every page load
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  loadHeaderAvatar();
  updateNotifBadge();

  const page = document.body.dataset.page;

  document.querySelectorAll('.tab[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  document.addEventListener('click', e => {
    const panel = document.getElementById('notif-panel');
    const btn   = document.getElementById('notif-btn');
    if (panel?.classList.contains('open') && !panel.contains(e.target) && !btn?.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  document.getElementById('new-profile-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addProfile();
  });
  document.getElementById('capture-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveCapturedVisitor();
  });

  switch (page) {
    case 'profile':     loadProfiles();          break;
    case 'dashboard':   loadDashboard();          break;
    case 'visitor':     loadVisitorProfilePage(); break;
    case 'userprofile': loadUserProfilePage();    break;
    case 'livefeed':    startCamera();            break;
    case 'verify': {
      const emailEl = document.getElementById('verify-email');
      if (emailEl) emailEl.textContent = get(KEYS.pendingEmail) || 'your email';
      break;
    }
  }
});
