export function renderInvitations(container, invitations) {
  if (invitations.length === 0) {
    container.innerHTML = '<p>No active invitations</p>';
    return;
  }
  
  const html = invitations.map(inv => `
    <div class="invitation-item" data-id="${inv.id}">
      <div class="invitation-info">
        <div class="username">From: ${inv.inviterUsername}</div>
        <div class="time">Expires: ${formatTime(inv.expiresAt)}</div>
      </div>
      <div class="invitation-actions">
        <button class="btn btn-primary accept-btn" data-id="${inv.id}">Accept</button>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

export function showInvitationsLoading(container) {
  container.innerHTML = '<p>Loading invitations...</p>';
}

export function showInvitationsError(container, message) {
  container.innerHTML = `<p class="error-message show">${message}</p>`;
}

function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = date - now;
  
  if (diff < 0) {
    return 'Expired';
  }
  
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  return `${minutes}m ${seconds}s`;
}
