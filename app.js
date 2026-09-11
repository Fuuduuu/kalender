'use strict';

const STORAGE_KEY = 'kohtumised.v1';
const LAST_BACKUP_KEY = 'kohtumised.viimaneVarukoopia';
const HINT_CLOSED_KEY = 'kohtumised.avakuvaVihjeSuletud';

const MONTHS = ['jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni', 'juuli', 'august', 'september', 'oktoober', 'november', 'detsember'];
const MONTHS_INESSIVE = ['jaanuaris', 'veebruaris', 'märtsis', 'aprillis', 'mais', 'juunis', 'juulis', 'augustis', 'septembris', 'oktoobris', 'novembris', 'detsembris'];
const WEEKDAYS = ['pühapäev', 'esmaspäev', 'teisipäev', 'kolmapäev', 'neljapäev', 'reede', 'laupäev'];

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const countText = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function todayKey() {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

// Tänased kohtumised loetakse toimunuks, homsed ja hilisemad planeerituks.
const isPlanned = (key) => key > todayKey();

function meetingPhrase(count, planned) {
  const kind = planned ? 'planeeritud' : 'toimunud';
  return countText(count, `${kind} kohtumine`, `${kind} kohtumist`);
}

function readSetting(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Seade jääb meelde ainult selleks korraks.
  }
}

/* ---------- Andmed ---------- */

function isMeeting(value) {
  return Boolean(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && value.name.trim() !== ''
    && typeof value.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value.date);
}

function loadMeetings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isMeeting) : [];
  } catch {
    return [];
  }
}

let meetings = loadMeetings();

function saveMeetings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
  } catch {
    showToast('Salvestamine ebaõnnestus: brauser ei luba andmeid salvestada.');
    return;
  }
  // Palub brauseril andmeid ruumipuuduse korral mitte kustutada.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

function newId() {
  if (self.crypto && typeof self.crypto.randomUUID === 'function') return self.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function meetingsOn(key) {
  return meetings
    .filter((meeting) => meeting.date === key)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/* ---------- Kalender ---------- */

const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  selected: null,
};

function renderCalendar() {
  const today = todayKey();
  const { year, month } = state;
  const prefix = `${year}-${pad(month + 1)}-`;

  const perDay = new Map();
  let past = 0;
  let planned = 0;
  for (const meeting of meetings) {
    if (!meeting.date.startsWith(prefix)) continue;
    perDay.set(meeting.date, (perDay.get(meeting.date) || 0) + 1);
    if (meeting.date > today) planned += 1;
    else past += 1;
  }

  const total = past + planned;
  $('count-total').textContent = total;
  $('count-label').textContent = `${total === 1 ? 'kohtumine' : 'kohtumist'} ${MONTHS_INESSIVE[month]}`;
  $('count-past').textContent = past;
  $('count-planned').textContent = planned;

  const now = new Date();
  $('month-label').textContent = `${capitalize(MONTHS[month])} ${year}`;
  $('today-btn').hidden = year === now.getFullYear() && month === now.getMonth();

  const blanks = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < blanks; i += 1) {
    cells.push('<span class="day day-blank" aria-hidden="true"></span>');
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dateKey(year, month, day);
    const count = perDay.get(key) || 0;
    const classes = ['day'];
    let label = `${day}. ${MONTHS[month]}`;
    if (count) {
      const future = key > today;
      classes.push(future ? 'day-planned' : 'day-past');
      label += `, ${meetingPhrase(count, future)}`;
    }
    if (key === today) {
      classes.push('day-today');
      label += ', täna';
    }
    const badge = count ? `<span class="badge" aria-hidden="true">${count}</span>` : '';
    cells.push(`<button type="button" class="${classes.join(' ')}" data-date="${key}" aria-label="${label}">${day}${badge}</button>`);
  }
  $('grid').innerHTML = cells.join('');
}

function showMonth(year, month) {
  const first = new Date(year, month, 1);
  state.year = first.getFullYear();
  state.month = first.getMonth();
  renderCalendar();
}

$('prev-month').addEventListener('click', () => showMonth(state.year, state.month - 1));
$('next-month').addEventListener('click', () => showMonth(state.year, state.month + 1));
$('today-btn').addEventListener('click', () => {
  const now = new Date();
  showMonth(now.getFullYear(), now.getMonth());
});

$('grid').addEventListener('click', (event) => {
  const cell = event.target.closest('button[data-date]');
  if (cell) openDay(cell.dataset.date);
});

// Kalendri pühkimine vasakule või paremale vahetab kuud.
let touchStart = null;
$('calendar').addEventListener('touchstart', (event) => {
  const touch = event.changedTouches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
$('calendar').addEventListener('touchend', (event) => {
  if (!touchStart) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    showMonth(state.year, state.month + (dx < 0 ? 1 : -1));
  }
}, { passive: true });

/* ---------- Päeva leht ---------- */

const daySheet = $('day-sheet');
const nameInput = $('name-input');

function renderDay() {
  const key = state.selected;
  if (!key) return;
  const [year, month, day] = key.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  const yearText = year === new Date().getFullYear() ? '' : ` ${year}`;
  $('day-title').textContent = `${capitalize(weekday)}, ${day}. ${MONTHS[month - 1]}${yearText}`;

  const planned = isPlanned(key);
  const list = meetingsOn(key);
  daySheet.classList.toggle('is-planned', planned);
  $('day-summary').textContent = list.length
    ? meetingPhrase(list.length, planned)
    : (planned ? 'Planeeritud kohtumisi pole' : 'Kohtumisi pole märgitud');
  nameInput.placeholder = planned ? 'Kellega kohtud?' : 'Kellega kohtusid?';

  const items = list.map((meeting) => {
    const item = document.createElement('li');
    item.className = 'meeting';
    const name = document.createElement('span');
    name.className = 'meeting-name';
    name.textContent = meeting.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn icon-btn-quiet';
    remove.setAttribute('aria-label', `Kustuta: ${meeting.name}`);
    remove.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg>';
    remove.addEventListener('click', () => deleteMeeting(meeting.id));
    item.append(name, remove);
    return item;
  });
  const listElement = $('meeting-list');
  listElement.replaceChildren(...items);
  listElement.hidden = items.length === 0;
}

function openSheet(dialog) {
  dialog.showModal();
  // Nähtav teade tõstetakse avatud lehe peale, et selle nupp jääks vajutatavaks.
  if (!toast.hidden) dialog.append(toast);
}

function openDay(key) {
  state.selected = key;
  nameInput.value = '';
  renderDay();
  openSheet(daySheet);
  if (meetingsOn(key).length === 0) nameInput.focus();
}

// Pärast lisamist leht sulgub, et uus toon ja number oleksid kalendris kohe näha.
$('add-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim().replace(/\s+/g, ' ');
  if (!name || !state.selected) {
    nameInput.focus();
    return;
  }
  const meeting = { id: newId(), name, date: state.selected, createdAt: Date.now() };
  meetings.push(meeting);
  saveMeetings();
  daySheet.close();
  refresh();
  showToast(`Lisatud: ${name}`, 'Võta tagasi', () => removeMeeting(meeting.id));
});

function removeMeeting(id) {
  const index = meetings.findIndex((meeting) => meeting.id === id);
  if (index === -1) return null;
  const [removed] = meetings.splice(index, 1);
  saveMeetings();
  refresh();
  return removed;
}

function deleteMeeting(id) {
  const removed = removeMeeting(id);
  if (!removed) return;
  showToast(`Kustutatud: ${removed.name}`, 'Võta tagasi', () => {
    if (meetings.some((meeting) => meeting.id === removed.id)) return;
    meetings.push(removed);
    saveMeetings();
    refresh();
  });
}

// Varem kasutatud nimed pakutakse sisestamisel välja, sagedasemad eespool.
function renderSuggestions() {
  const usage = new Map();
  for (const meeting of meetings) usage.set(meeting.name, (usage.get(meeting.name) || 0) + 1);
  const options = [...usage.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'et'))
    .slice(0, 50)
    .map(([name]) => {
      const option = document.createElement('option');
      option.value = name;
      return option;
    });
  $('name-suggestions').replaceChildren(...options);
}

/* ---------- Lehed ja teated ---------- */

const backupSheet = $('backup-sheet');
const toast = $('toast');
let toastTimer = null;

function refresh() {
  renderCalendar();
  renderSuggestions();
  if (daySheet.open) renderDay();
  if (backupSheet.open) renderBackupInfo();
}

function hideToast() {
  toast.hidden = true;
}

function showToast(message, actionLabel, onAction) {
  // Avatud lehe ajal on muu leht blokeeritud, seega peab teade olema lehe sees.
  const host = document.querySelector('dialog[open]') || document.body;
  if (toast.parentElement !== host) host.append(toast);
  $('toast-text').textContent = message;
  const action = $('toast-action');
  action.hidden = !actionLabel;
  action.textContent = actionLabel || '';
  action.onclick = () => {
    hideToast();
    if (onAction) onAction();
  };
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, actionLabel ? 6000 : 3500);
}

for (const dialog of document.querySelectorAll('dialog')) {
  // Klõps lehe taga oleval taustal sulgeb lehe.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (toast.parentElement === dialog) document.body.append(toast);
  });
}

document.addEventListener('click', (event) => {
  const closer = event.target.closest('[data-close]');
  if (closer) closer.closest('dialog').close();
});

// iPhone'is tõstetakse leht klaviatuuri kohale, et sisestusväli jääks nähtavale.
if (window.visualViewport) {
  const viewport = window.visualViewport;
  const syncViewport = () => {
    const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty('--keyboard', `${Math.round(keyboard)}px`);
    document.documentElement.style.setProperty('--viewport-height', `${Math.round(viewport.height)}px`);
  };
  viewport.addEventListener('resize', syncViewport);
  viewport.addEventListener('scroll', syncViewport);
  syncViewport();
}

/* ---------- Varukoopia ---------- */

function renderBackupInfo() {
  $('backup-count').textContent = `Selles seadmes on ${countText(meetings.length, 'kohtumine', 'kohtumist')}.`;
  const last = readSetting(LAST_BACKUP_KEY);
  $('backup-last').textContent = last
    ? `Viimane varukoopia: ${new Date(last).toLocaleDateString('et-EE')}`
    : 'Varukoopiat pole veel tehtud.';
}

$('open-backup').addEventListener('click', () => {
  renderBackupInfo();
  openSheet(backupSheet);
});

$('export-btn').addEventListener('click', async () => {
  const fileName = `kohtumised-${todayKey()}.json`;
  const content = JSON.stringify({ app: 'minu-kohtumised', version: 1, exportedAt: new Date().toISOString(), meetings }, null, 2);
  const file = new File([content], fileName, { type: 'application/json' });
  // Telefonis avab jagamismenüü (salvesta failidesse, saada e-postiga), arvutis laeb faili alla.
  const useShare = matchMedia('(pointer: coarse)').matches
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [file] });
  try {
    if (useShare) {
      await navigator.share({ files: [file], title: 'Kohtumiste varukoopia' });
    } else {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      backupSheet.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  } catch (error) {
    if (!error || error.name !== 'AbortError') showToast('Varukoopia salvestamine ebaõnnestus.');
    return;
  }
  writeSetting(LAST_BACKUP_KEY, new Date().toISOString());
  renderBackupInfo();
  showToast('Varukoopia on salvestatud.');
});

$('import-input').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;

  let incoming;
  try {
    const data = JSON.parse(await file.text());
    incoming = Array.isArray(data) ? data : data && data.meetings;
    if (!Array.isArray(incoming)) throw new Error('Pole varukoopia');
  } catch {
    showToast('See fail ei ole kohtumiste varukoopia.');
    return;
  }

  // Liidab failist puuduvad kohtumised olemasolevatele, midagi üle ei kirjutata.
  const known = new Set(meetings.map((meeting) => meeting.id));
  let added = 0;
  for (const item of incoming) {
    if (!isMeeting(item) || known.has(item.id)) continue;
    known.add(item.id);
    meetings.push({ id: item.id, name: item.name.trim(), date: item.date, createdAt: Number(item.createdAt) || Date.now() });
    added += 1;
  }
  if (added) saveMeetings();
  refresh();
  showToast(added ? `Taastatud ${countText(added, 'kohtumine', 'kohtumist')}.` : 'Kõik selle faili kohtumised on juba olemas.');
});

/* ---------- Avakuvale lisamine ---------- */

let installPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function showInstallHint(canPrompt) {
  if (isStandalone() || readSetting(HINT_CLOSED_KEY)) return;
  // iPhone'is on avakuvalt avatud äpil Safarist eraldi andmed, seega tuleb see lisada enne kasutamist.
  $('install-text').textContent = canPrompt
    ? 'Lisa kalender avakuvale, siis avaneb see nagu tavaline äpp.'
    : 'Lisa kalender enne kasutamist avakuvale: vajuta jagamisnuppu ja vali „Lisa avakuvale”.';
  $('install-btn').hidden = !canPrompt;
  $('install-hint').hidden = false;
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  showInstallHint(true);
});

window.addEventListener('appinstalled', () => {
  $('install-hint').hidden = true;
});

$('install-btn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  $('install-hint').hidden = true;
});

$('install-close').addEventListener('click', () => {
  writeSetting(HINT_CLOSED_KEY, '1');
  $('install-hint').hidden = true;
});

if (isIos()) showInstallHint(false);

/* ---------- Käivitus ---------- */

// Kui äpp jääb üle öö lahti, liigub "täna" järgmisel avamisel õigesse kohta.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});

// Mitmes aknas lahti olles hoitakse kalendrid kooskõlas.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  meetings = loadMeetings();
  refresh();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

refresh();
