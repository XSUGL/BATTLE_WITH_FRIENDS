export function renderMatchHistory(container, history) {
  if (history.length === 0) {
    container.innerHTML = '<p>No match history yet. Play some matches to see your history here!</p>';
    return;
  }
  
  const html = history.map(match => {
    const resultClass = getResultClass(match.result);
    const resultText = getResultText(match.result);
    const scoreDisplay = formatScore(match.myScore, match.opponentScore, match.result);
    
    return `
      <div class="match-history-item ${resultClass}">
        <div class="match-header">
          <span class="match-result ${resultClass}">${resultText}</span>
          <span class="match-date">${formatDate(match.createdAt)}</span>
        </div>
        <div class="match-details">
          <span class="opponent">vs ${match.opponentUsername}</span>
          <span class="score-display">${scoreDisplay}</span>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = `<div class="match-history-list">${html}</div>`;
}

export function showMatchHistoryLoading(container) {
  container.innerHTML = '<p>Loading match history...</p>';
}

export function showMatchHistoryError(container, message) {
  container.innerHTML = `<p class="error-message show">${message}</p>`;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function getResultClass(result) {
  return `result-${result}`;
}

function getResultText(result) {
  const texts = {
    'win': 'Win',
    'loss': 'Loss',
    'cancelled': 'Cancelled'
  };
  return texts[result] || result;
}

function formatScore(myScore, opponentScore, result) {
  if (result === 'cancelled') {
    return '<span class="negative">-</span>';
  }
  
  const myScoreClass = myScore > 0 ? 'positive' : 'negative';
  const opponentScoreClass = opponentScore > 0 ? 'positive' : 'negative';
  
  return `<span class="${myScoreClass}">${myScore > 0 ? '+' : ''}${myScore}</span> / <span class="${opponentScoreClass}">${opponentScore > 0 ? '+' : ''}${opponentScore}</span>`;
}
