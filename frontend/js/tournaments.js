import { getToken, getUser } from './api/auth-api.js';
import {
  listTournaments,
  createTournament,
  joinTournament
} from './api/tournament-api.js';

// ── Auth guard ────────────────────────────────────────────────────────────
if (!getToken()) {
  window.location.href = '/webapp2/index.html';
}
const user = getUser();
if (!user) {
  window.location.href = '/webapp2/index.html';
}

// ── DOM ───────────────────────────────────────────────────────────────────
const listEl       = document.getElementById('tournamentsList');
const form         = document.getElementById('create-form');
const nameInput    = document.getElementById('tname');
const sizeButtons  = document.getElementById('sizeButtons');
const createBtn    = document.getElementById('createBtn');
const createError  = document.getElementById('createError');

// Stato locale: dimensione selezionata
let selectedSize = 8;

// ── Size buttons ──────────────────────────────────────────────────────────
sizeButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('.size-btn');
  if (!btn) return;
  selectedSize = Number(btn.dataset.size);
  sizeButtons.querySelectorAll('.size-btn').forEach(b => {
    b.classList.toggle('selected', b === btn);
  });
});

// ── Create form ───────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  createError.classList.remove('show');
  const name = nameInput.value.trim();
  if (name.length < 3) {
    showCreateError('Name must be at least 3 characters');
    return;
  }
  try {
    createBtn.disabled = true;
    createBtn.textContent = 'CREATING…';
    const t = await createTournament({ name, size: selectedSize });
    // Creator è già partecipante (lato server). Vai alla lobby.
    window.location.href = `/webapp2/tournament-lobby.html?id=${t.id}`;
  } catch (err) {
    showCreateError(err.message || 'Failed to create tournament');
    createBtn.disabled = false;
    createBtn.textContent = '⚔ CREATE';
  }
});

function showCreateError(msg) {
  createError.textContent = msg;
  createError.classList.add('show');
}

// ── List rendering ────────────────────────────────────────────────────────
async function loadList() {
  try {
    const items = await listTournaments();
    if (!items || items.length === 0) {
      listEl.innerHTML = `<p class="empty">No tournaments yet. Create one above!</p>`;
      return;
    }
    listEl.innerHTML = items.map(renderCard).join('');
  } catch (err) {
    listEl.innerHTML = `<p class="empty" style="color:var(--accent2)">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function renderCard(t) {
  const statusClass = t.status === 'running' ? 'running'
                    : t.status === 'completed' ? 'completed'
                    : '';
  const pillClass = t.status === 'running' ? 'pill-running'
                  : t.status === 'completed' ? 'pill-completed'
                  : '';
  const isLobby   = t.status === 'lobby';
  const isFull    = t.participantsCount >= t.size;

  let action = '';
  if (t.status === 'lobby' && !isFull) {
    action = `<button class="btn btn-primary join-btn" data-id="${t.id}">⚔ JOIN</button>`;
  } else if (t.status === 'running') {
    action = `<button class="btn btn-secondary view-btn" data-id="${t.id}">▶ VIEW BRACKET</button>`;
  } else if (isLobby && isFull) {
    action = `<button class="btn btn-secondary" disabled>FULL</button>`;
  } else {
    action = `<button class="btn btn-secondary view-btn" data-id="${t.id}">VIEW</button>`;
  }

  return `
    <div class="tourn-card ${statusClass}">
      <div class="tourn-name">${escapeHtml(t.name)}</div>
      <div class="tourn-meta">
        <span class="pill ${pillClass}">${t.status.toUpperCase()}</span>
        <span>SIZE ${t.size}</span>
        <span>${t.participantsCount}/${t.size} PLAYERS</span>
        <span>BY ${escapeHtml(t.creatorUsername || '?')}</span>
      </div>
      <div class="tourn-actions">${action}</div>
    </div>
  `;
}

// ── Delegated click handler for join / view ───────────────────────────────
listEl.addEventListener('click', async (e) => {
  const joinBtn = e.target.closest('.join-btn');
  const viewBtn = e.target.closest('.view-btn');
  if (joinBtn) {
    const id = joinBtn.dataset.id;
    joinBtn.disabled = true;
    joinBtn.textContent = 'JOINING…';
    try {
      await joinTournament(id);
      window.location.href = `/webapp2/tournament-lobby.html?id=${id}`;
    } catch (err) {
      // Se sei già iscritto, vai comunque alla lobby
      if (/already joined/i.test(err.message || '')) {
        window.location.href = `/webapp2/tournament-lobby.html?id=${id}`;
        return;
      }
      alert(err.message || 'Failed to join tournament');
      joinBtn.disabled = false;
      joinBtn.textContent = '⚔ JOIN';
    }
    return;
  }
  if (viewBtn) {
    window.location.href = `/webapp2/tournament-lobby.html?id=${viewBtn.dataset.id}`;
  }
});

// ── Polling ───────────────────────────────────────────────────────────────
loadList();
setInterval(loadList, 5000);

// ── Utils ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
