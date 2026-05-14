import { getToken, getUser } from './api/auth-api.js';
import { getTournament } from './api/tournament-api.js';

// ── Auth guard ────────────────────────────────────────────────────────────
if (!getToken()) {
  window.location.href = '/webapp2/index.html';
}
const user = getUser();
if (!user) {
  window.location.href = '/webapp2/index.html';
}

// ── Params ────────────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const tournamentId = parseInt(params.get('id'), 10);
if (!tournamentId || Number.isNaN(tournamentId)) {
  alert('Invalid tournament id');
  window.location.href = '/webapp2/tournaments.html';
}

// ── DOM ───────────────────────────────────────────────────────────────────
const loadingEl   = document.getElementById('loading');
const contentEl   = document.getElementById('tourn-content');
const nameEl      = document.getElementById('tname');
const statsEl     = document.getElementById('tstats');
const statusEl    = document.getElementById('tstatus');
const playersEl   = document.getElementById('players');
const bracketSec  = document.getElementById('bracket-section');
const bracketEl   = document.getElementById('bracket');
const ctaSec      = document.getElementById('cta-section');
const ctaBtn      = document.getElementById('cta-btn');
const ctaBanner   = document.getElementById('cta-banner');

// Stato locale: l'ultimo openMatch noto. Se cambia, redirect immediato.
let lastSeenOpenMatchId = null;
let redirecting = false;

ctaBtn.addEventListener('click', () => {
  if (!lastSeenOpenMatchId) return;
  goToMatch(lastSeenOpenMatchId);
});

function goToMatch(matchId) {
  if (redirecting) return;
  redirecting = true;
  window.location.href = `/webapp2/character-select.html?matchId=${matchId}`;
}

// ── Polling loop ──────────────────────────────────────────────────────────
async function poll() {
  try {
    const t = await getTournament(tournamentId);
    if (!t) {
      loadingEl.textContent = 'Tournament not found.';
      return;
    }
    render(t);

    // Auto-redirect appena è disponibile un match per questo utente.
    if (t.myOpenMatch && t.myOpenMatch.id !== lastSeenOpenMatchId) {
      lastSeenOpenMatchId = t.myOpenMatch.id;
      goToMatch(t.myOpenMatch.id);
    } else if (!t.myOpenMatch) {
      lastSeenOpenMatchId = null;
    }
  } catch (err) {
    console.warn('Tournament poll error:', err.message);
  }
}

poll();
const pollInterval = setInterval(poll, 3000);
window.addEventListener('beforeunload', () => clearInterval(pollInterval));

// ── Render ────────────────────────────────────────────────────────────────
function render(t) {
  loadingEl.style.display = 'none';
  contentEl.style.display = '';

  nameEl.textContent = t.name;
  const filled = (t.participants || []).length;
  statsEl.innerHTML = `
    <span>SIZE ${t.size}</span>
    <span>${filled}/${t.size} PLAYERS</span>
    <span>BY ${escapeHtml(t.participants?.[0]?.username || '?')}</span>
  `;

  // Status pill
  const pillClass = t.status === 'running' ? 'pill-running'
                  : t.status === 'completed' ? 'pill-completed'
                  : '';
  statusEl.innerHTML = `<span class="pill ${pillClass}">${t.status.toUpperCase()}</span>`;

  // Players grid
  renderPlayers(t);

  // Bracket (mostralo solo se ci sono match)
  if (t.bracket && t.bracket.length > 0) {
    bracketSec.style.display = '';
    renderBracket(t);
  } else {
    bracketSec.style.display = 'none';
  }

  // CTA
  if (t.myOpenMatch && !redirecting) {
    ctaSec.style.display = '';
    const isActive = t.bracket?.find(m => m.id === t.myOpenMatch.id)?.status === 'active';
    ctaBanner.textContent = isActive ? '⚔ YOUR MATCH IS LIVE — JOIN NOW' : 'YOUR NEXT MATCH IS READY';
  } else {
    ctaSec.style.display = 'none';
  }

  // Winner banner se completato
  if (t.status === 'completed' && t.winnerId) {
    const winnerName = t.participants?.find(p => p.userId === t.winnerId)?.username || '?';
    const existing = document.getElementById('winner-banner');
    if (!existing) {
      const banner = document.createElement('div');
      banner.id = 'winner-banner';
      banner.className = 'winner-banner';
      banner.innerHTML = `
        <span class="crown">👑</span>
        <div class="label">TOURNAMENT CHAMPION</div>
        <div class="name">${escapeHtml(winnerName)}</div>
      `;
      contentEl.appendChild(banner);
    }
  }
}

function renderPlayers(t) {
  const slots = Array.from({ length: t.size }, (_, i) => t.participants?.[i] || null);
  playersEl.innerHTML = slots.map((p, i) => {
    if (!p) {
      return `<div class="player-tile">
        <span class="player-seed">${i + 1}.</span>
        <span class="player-name empty-slot">waiting…</span>
      </div>`;
    }
    const isMe = p.userId === user.id;
    const elim = !!p.eliminatedAt;
    const classes = ['player-tile'];
    if (isMe) classes.push('me');
    if (elim) classes.push('eliminated');
    return `<div class="${classes.join(' ')}">
      <span class="player-seed">${p.seed ?? (i + 1)}.</span>
      <span class="player-name">${escapeHtml(p.username)}${isMe ? ' (you)' : ''}</span>
    </div>`;
  }).join('');
}

function renderBracket(t) {
  // Raggruppa i match per round
  const rounds = {};
  for (const m of t.bracket) {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }
  const totalRounds = Math.log2(t.size);
  const roundLabels = {
    1: t.size === 2 ? 'FINAL' : t.size === 4 ? 'SEMIFINAL' : 'ROUND 1',
  };
  // Ultimo round = finale; penultimo = semifinale
  for (let r = 1; r <= totalRounds; r++) {
    if (r === totalRounds) roundLabels[r] = 'FINAL';
    else if (r === totalRounds - 1) roundLabels[r] = 'SEMIFINAL';
    else if (r === totalRounds - 2) roundLabels[r] = 'QUARTERFINAL';
    else roundLabels[r] = `ROUND ${r}`;
  }

  const html = [];
  for (let r = 1; r <= totalRounds; r++) {
    const matches = rounds[r] || [];
    html.push(`<div class="bracket-round">
      <div class="round-label">${roundLabels[r]}</div>
      ${matches.length === 0
        ? `<div class="match-tile pending"><div class="match-meta">TBD</div></div>`
        : matches.sort((a, b) => a.bracketSlot - b.bracketSlot).map(m => renderMatch(m, t)).join('')
      }
    </div>`);
  }
  bracketEl.innerHTML = html.join('');
}

function renderMatch(m, t) {
  const classes = ['match-tile', m.status];
  const involvesMe = m.player1Id === user.id || m.player2Id === user.id;
  if (involvesMe && m.status !== 'completed') classes.push('mine');

  const p1Class = m.status === 'completed'
    ? (m.winnerId === m.player1Id ? 'winner' : 'loser')
    : '';
  const p2Class = m.status === 'completed'
    ? (m.winnerId === m.player2Id ? 'winner' : 'loser')
    : '';

  return `<div class="${classes.join(' ')}">
    <div class="match-side ${p1Class}">
      <span>${escapeHtml(m.player1Username || '?')}</span>
      ${m.status === 'completed' && m.winnerId === m.player1Id ? '<span>🏆</span>' : ''}
    </div>
    <div class="match-vs">VS</div>
    <div class="match-side ${p2Class}">
      <span>${escapeHtml(m.player2Username || '?')}</span>
      ${m.status === 'completed' && m.winnerId === m.player2Id ? '<span>🏆</span>' : ''}
    </div>
    <div class="match-meta">${m.status.toUpperCase()}</div>
  </div>`;
}

// ── Utils ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
