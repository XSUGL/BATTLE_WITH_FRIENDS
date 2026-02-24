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
  } catch (error) {
    inviteError.textContent = error.message;
    inviteError.classList.add('show');
  }
});

// Load active invitations
async function loadInvitations() {
  try {
    showInvitationsLoading(invitationsContainer);
    const invitations = await getActiveInvitations();
    renderInvitations(invitationsContainer, invitations);
    
    // Add event listeners to accept buttons
    const acceptButtons = document.querySelectorAll('.accept-btn');
    acceptButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const invitationId = btn.dataset.id;
        try {
          await acceptInvitation(invitationId);
          alert('Invitation accepted! Match created.');
          loadInvitations();
        } catch (error) {
          alert('Failed to accept invitation: ' + error.message);
        }
      });
    });
  } catch (error) {
    showInvitationsError(invitationsContainer, error.message);
  }
}

// Load leaderboard
async function loadLeaderboard() {
  try {
    showLeaderboardLoading(leaderboardContainer);
    const leaderboard = await getLeaderboard();
    renderLeaderboard(leaderboardContainer, leaderboard, user.id);
  } catch (error) {
    showLeaderboardError(leaderboardContainer, error.message);
  }
}

// Load match history
async function loadMatchHistory() {
  try {
    showMatchHistoryLoading(matchHistoryContainer);
    const history = await getMatchHistory();
    renderMatchHistory(matchHistoryContainer, history);
  } catch (error) {
    showMatchHistoryError(matchHistoryContainer, error.message);
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
