export function renderLeaderboard(container, leaderboard, currentUserId) {
  if (leaderboard.length === 0) {
    container.innerHTML = '<p>No players found in leaderboard</p>';
    return;
  }
  
  const rows = leaderboard.map(entry => {
    const isCurrentUser = entry.userId === currentUserId;
    const rowClass = isCurrentUser ? 'leaderboard-row-current-user' : '';
    
    return `
      <tr class="${rowClass}">
        <td>${entry.rank}</td>
        <td>${entry.username}</td>
        <td>${entry.totalScore}</td>
      </tr>
    `;
  }).join('');
  
  const html = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Username</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
  
  container.innerHTML = html;
}

export function showLeaderboardLoading(container) {
  container.innerHTML = '<p>Loading leaderboard...</p>';
}

export function showLeaderboardError(container, message) {
  container.innerHTML = `<p class="error-message show">${message}</p>`;
}
