import { getToken, getUser, logout } from './api/auth-api.js';
import { 
  sendInvitation, 
  getActiveInvitations, 
  acceptInvitation,
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
  window.location.href = '/index.html';
}

const user = getUser();
if (!user) {
  window.location.href = '/index.html';
}

// DOM elements
const usernameDisplay = document.getElementById('username-display');
const logoutBtn = document.getElementById('logout-btn');
const inviteForm = document.getElementById('invite-form');
const inviteUsername = document.getElementById('invite-username');
const inviteError = document.getElementById('invite-error');
const inviteSuccess = document.getElementById('invite-success');
const invitationsContainer = document.getElementById('invitations-container');
const leaderboardContainer = document.getElementById('leaderboard-container');
const matchHistoryContainer = document.getElementById('match-history-container');

// Display username
usernameDisplay.textContent = user.username;

// Logout handler
logoutBtn.addEventListener('click', () => {
  logout();
  window.location.href = '/index.html';
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
    
    setTimeout(() => {
      inviteSuccess.classList.remove('show');
    }, 3000);
    
    // Ricarica la lista subito dopo aver inviato
    loadInvitations();
  } catch (error) {
    inviteError.textContent = error.message;
    inviteError.classList.add('show');
  }
});

// ==========================================
// 🔴 LA BOMBA NUCLEARE PER IL BOTTONE FANTASMA
// ==========================================
// Ascoltiamo i click su TUTTO il documento, ovunque sia il pop-up!
document.addEventListener('click', async (e) => {
  // Controlla se abbiamo cliccato un elemento con la classe 'accept-btn'
  const acceptBtn = e.target.closest('.accept-btn');
  
  if (acceptBtn) {
    const invitationId = acceptBtn.dataset.id;
    try {
      // Blocca il bottone per evitare doppi click
      acceptBtn.disabled = true;
      acceptBtn.textContent = 'Connecting...';
      
      // Accetta l'invito nel backend
      const result = await acceptInvitation(invitationId);
      
      // 🚀 BOOM! TI PORTA AL GIOCO! 🚀
      window.location.href = `/game.html?matchId=${result.id}`;
      
    } catch (error) {
      alert('Failed to accept invitation: ' + error.message);
      acceptBtn.disabled = false;
      acceptBtn.textContent = 'Accept';
    }
  }
});

// Load active invitations
async function loadInvitations() {
  try {
    // Evita l'effetto "lampeggio" ogni 10 secondi
    if (invitationsContainer && invitationsContainer.innerHTML === '') {
      showInvitationsLoading(invitationsContainer);
    }
    const invitations = await getActiveInvitations();
    if (invitationsContainer) {
      renderInvitations(invitationsContainer, invitations);
    }
  } catch (error) {
    if (invitationsContainer) {
      showInvitationsError(invitationsContainer, error.message);
    }
  }
}

// Load leaderboard
async function loadLeaderboard() {
  try {
    if (leaderboardContainer && leaderboardContainer.innerHTML === '') {
      showLeaderboardLoading(leaderboardContainer);
    }
    const leaderboard = await getLeaderboard();
    if (leaderboardContainer) {
      renderLeaderboard(leaderboardContainer, leaderboard, user.id);
    }
  } catch (error) {
    if (leaderboardContainer) {
      showLeaderboardError(leaderboardContainer, error.message);
    }
  }
}

// Load match history
async function loadMatchHistory() {
  try {
    if (matchHistoryContainer && matchHistoryContainer.innerHTML === '') {
      showMatchHistoryLoading(matchHistoryContainer);
    }
    const history = await getMatchHistory();
    if (matchHistoryContainer) {
      renderMatchHistory(matchHistoryContainer, history);
    }
  } catch (error) {
    if (matchHistoryContainer) {
      showMatchHistoryError(matchHistoryContainer, error.message);
    }
  }
}

// Initial load
loadInvitations();
loadLeaderboard();
loadMatchHistory();

// Auto-refresh every 10 seconds
setInterval(() => {
  loadInvitations();
  loadLeaderboard();
  loadMatchHistory();
}, 10000);