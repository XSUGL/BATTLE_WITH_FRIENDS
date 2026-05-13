import { getToken, getUser, logout } from './api/auth-api.js';
import { 
  sendInvitation, 
  getActiveInvitations, 
  acceptInvitation,
  getActiveMatch,
  getLeaderboard,
  getMatchHistory
} from './api/match-api.js';
import { 
  renderInvitations, 
  showInvitationsLoading, 
  showInvitationsError 
} from './ui/invitation-ui.js';
import {
  renderLeaderboard,
  showLeaderboardLoading,
  showLeaderboardError
} from './ui/leaderboard-ui.js';
import {
  renderMatchHistory,
  showMatchHistoryLoading,
  showMatchHistoryError
} from './ui/match-history-ui.js';

// Check authentication
if (!getToken()) {
  window.location.href = '/webapp2/index.html';
}

const user = getUser();
if (!user) {
  window.location.href = '/webapp2/index.html';
}

// DOM elements
const usernameDisplay       = document.getElementById('username-display');
const logoutBtn             = document.getElementById('logout-btn');
const inviteForm            = document.getElementById('invite-form');
const inviteUsername        = document.getElementById('invite-username');
const inviteError           = document.getElementById('invite-error');
const inviteSuccess         = document.getElementById('invite-success');
const invitationsContainer  = document.getElementById('invitations-container');
const leaderboardContainer  = document.getElementById('leaderboard-container');
const matchHistoryContainer = document.getElementById('match-history-container');

// Display username
usernameDisplay.textContent = user.username;

// Logout handler
logoutBtn.addEventListener('click', () => {
  logout();
  window.location.href = '/webapp2/index.html';
});

// Send invitation
inviteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = inviteUsername.value.trim();
  try {
    inviteError.classList.remove('show');
    inviteSuccess.classList.remove('show');
    await sendInvitation(username);
    inviteSuccess.textContent = 'Invitation sent successfully!';
    inviteSuccess.classList.add('show');
    inviteUsername.value = '';
    // Passa l'avversario invitato e il timestamp di partenza: il polling
    // accetterà SOLO match contro quell'utente e creati da ora in avanti.
    // Senza questi filtri, match vecchi 'pending' in DB (test interrotti,
    // crash) potrebbero deviare uno dei due client su un matchId sbagliato.
    startActiveMatchPolling(username, Date.now());
    setTimeout(() => { inviteSuccess.classList.remove('show'); }, 3000);
    loadInvitations();
  } catch (error) {
    inviteError.textContent = error.message;
    inviteError.classList.add('show');
  }
});

// ==========================================
// Accept invite → Player 2 va alla scelta personaggio
// ==========================================
document.addEventListener('click', async (e) => {
  const acceptBtn = e.target.closest('.accept-btn');
  if (acceptBtn) {
    const invitationId = acceptBtn.dataset.id;
    try {
      acceptBtn.disabled = true;
      acceptBtn.textContent = 'Connecting...';
      const result = await acceptInvitation(invitationId);
      const matchId = result.id || result.match?.id;
      window.location.href = `/webapp2/character-select.html?matchId=${matchId}`;
    } catch (error) {
      alert('Failed to accept invitation: ' + error.message);
      acceptBtn.disabled = false;
      acceptBtn.textContent = 'Accept';
    }
  }
});

// ==========================================
// Polling per Player 1 (invitante)
// ==========================================
let activeMatchPollingInterval = null;
let activeMatchPollingTimeout = null;

function startActiveMatchPolling(opponentUsername = null, sinceMs = null) {
  if (activeMatchPollingInterval) return;
  // Salva i filtri della sessione di polling corrente
  const opts = {};
  if (opponentUsername) opts.opponent = opponentUsername;
  if (Number.isFinite(sinceMs)) opts.since = sinceMs;

  activeMatchPollingInterval = setInterval(async () => {
    try {
      const match = await getActiveMatch(opts);
      if (match && match.id) {
        clearInterval(activeMatchPollingInterval);
        clearTimeout(activeMatchPollingTimeout);
        activeMatchPollingInterval = null;
        activeMatchPollingTimeout = null;
        window.location.href = `/webapp2/character-select.html?matchId=${match.id}`;
      }
    } catch (e) {
      // ignora errori di rete silenziosi
    }
  }, 2000);

  // Evita polling infinito se l'invito non viene accettato.
  activeMatchPollingTimeout = setTimeout(() => {
    clearInterval(activeMatchPollingInterval);
    activeMatchPollingInterval = null;
    activeMatchPollingTimeout = null;
  }, 3 * 60 * 1000);
}

// Load active invitations
async function loadInvitations() {
  try {
    if (invitationsContainer && invitationsContainer.innerHTML === '') {
      showInvitationsLoading(invitationsContainer);
    }
    const invitations = await getActiveInvitations();
    if (invitationsContainer) renderInvitations(invitationsContainer, invitations);
  } catch (error) {
    if (invitationsContainer) showInvitationsError(invitationsContainer, error.message);
  }
}

// Load leaderboard
async function loadLeaderboard() {
  try {
    if (leaderboardContainer && leaderboardContainer.innerHTML === '') {
      showLeaderboardLoading(leaderboardContainer);
    }
    const leaderboard = await getLeaderboard();
    if (leaderboardContainer) renderLeaderboard(leaderboardContainer, leaderboard, user.id);
  } catch (error) {
    if (leaderboardContainer) showLeaderboardError(leaderboardContainer, error.message);
  }
}

// Load match history
async function loadMatchHistory() {
  try {
    if (matchHistoryContainer && matchHistoryContainer.innerHTML === '') {
      showMatchHistoryLoading(matchHistoryContainer);
    }
    const history = await getMatchHistory();
    if (matchHistoryContainer) renderMatchHistory(matchHistoryContainer, history);
  } catch (error) {
    if (matchHistoryContainer) showMatchHistoryError(matchHistoryContainer, error.message);
  }
}

// Initial load
loadInvitations();
loadLeaderboard();
loadMatchHistory();

// Auto-refresh ogni 10 secondi
setInterval(() => {
  loadInvitations();
  loadLeaderboard();
  loadMatchHistory();
}, 10000);