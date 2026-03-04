import { getToken, getUser } from './api/auth-api.js';

// Prendi il Match ID dall'URL
const urlParams = new URLSearchParams(window.location.search);
const matchId = parseInt(urlParams.get('matchId'));

if (!matchId) {
  alert('ID Partita non valido!');
  window.location.href = '/dashboard.html';
}

const user = getUser();
const token = getToken();

if (!user || !token) {
  window.location.href = '/index.html';
}

// Variabili di gioco
let ws;
let playerNumber;
let gameState = null;

// Elementi HTML
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const score1El = document.getElementById('score1');
const score2El = document.getElementById('score2');
const timerEl = document.getElementById('timer');
const statusOverlay = document.getElementById('statusOverlay');
const statusMessage = document.getElementById('statusMessage');

// Tasti premuti
const keys = { up: false, down: false, left: false, right: false };

// Connessione WebSocket
function connect() {
  ws = new WebSocket('ws://localhost:3000');
  
  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'join_match',
      matchId: matchId,
      userId: user.id,
      token: token
    }));
  };
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'joined':
        playerNumber = message.playerNumber;
        showStatus('In attesa dell\'avversario...');
        break;
      case 'opponent_joined':
        showStatus('Avversario trovato! Preparati...');
        break;
      case 'countdown':
        showStatus(message.seconds);
        break;
      case 'game_start':
        gameState = message.initialState;
        hideStatus();
        startGameLoop();
        break;
      case 'state_update':
        gameState = message.state;
        break;
      case 'game_over':
        showStatus(playerNumber === message.winner ? 'HAI VINTO! 🎉' : 'HAI PERSO! 😭');
        setTimeout(() => window.location.href = '/dashboard.html', 5000);
        break;
      case 'error':
        alert(message.message);
        window.location.href = '/dashboard.html';
        break;
    }
  };
}

function startGameLoop() {
  // Disegna il gioco 60 volte al secondo
  setInterval(() => {
    if (gameState) {
      render();
      updateUI();
    }
  }, 1000 / 60);
  
  // Invia i comandi al server
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', keys: keys }));
    }
  }, 1000 / 60);
}

function render() {
  // Sfondo nero
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Player 1 (Blu)
  ctx.fillStyle = '#3498db';
  ctx.fillRect(gameState.player1.x, gameState.player1.y, gameState.player1.width, gameState.player1.height);
  
  // Player 2 (Rosso)
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(gameState.player2.x, gameState.player2.y, gameState.player2.width, gameState.player2.height);
  
  // Monete (Gialle)
  ctx.fillStyle = '#f1c40f';
  gameState.coins.forEach(coin => {
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, 10, 0, Math.PI * 2);
    ctx.fill();
  });
}

function updateUI() {
  score1El.textContent = gameState.player1.score;
  score2El.textContent = gameState.player2.score;
  
  const minutes = Math.floor(gameState.timer / 60);
  const seconds = gameState.timer % 60;
  timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function showStatus(text) {
  statusMessage.textContent = text;
  statusOverlay.classList.remove('hidden');
}

function hideStatus() {
  statusOverlay.classList.add('hidden');
}

// Lettura Tasti
document.addEventListener('keydown', (e) => {
  if (e.key === 'w' || e.key === 'ArrowUp') keys.up = true;
  if (e.key === 's' || e.key === 'ArrowDown') keys.down = true;
  if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = true;
  if (e.key === 'd' || e.key === 'ArrowRight') keys.right = true;
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'w' || e.key === 'ArrowUp') keys.up = false;
  if (e.key === 's' || e.key === 'ArrowDown') keys.down = false;
  if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = false;
  if (e.key === 'd' || e.key === 'ArrowRight') keys.right = false;
});

document.getElementById('forfeitBtn').addEventListener('click', () => {
  if (confirm('Sicuro di voler abbandonare?')) {
    ws.send(JSON.stringify({ type: 'forfeit' }));
  }
});

connect();
