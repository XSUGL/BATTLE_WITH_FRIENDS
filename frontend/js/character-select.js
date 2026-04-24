import { getToken, getUser } from './api/auth-api.js';

const urlParams = new URLSearchParams(window.location.search);
const matchId   = parseInt(urlParams.get('matchId'));
if (!matchId) { window.location.href = '/webapp2/dashboard.html'; }

const user  = getUser();
const token = getToken();
if (!user || !token) { window.location.href = '/webapp2/index.html'; }

let ws, playerNumber;
let selectedClass = null;
let selectedMap   = null;
let iAmReady      = false;

const csStatus       = document.getElementById('csStatus');
const opponentStatus = document.getElementById('opponentStatus');
const readyBtn       = document.getElementById('readyBtn');
const mapDecided     = document.getElementById('mapDecided');
const classCards     = document.querySelectorAll('.class-card');
const mapCards       = document.querySelectorAll('.map-card');

function checkReadyBtn() {
  readyBtn.disabled = !(selectedClass && selectedMap);
}

function updateMapVotes(votes) {
  mapCards.forEach(card => {
    const mapId = card.dataset.map;
    const el    = document.getElementById(`votes-${mapId}`);
    if (!el) return;
    let icons = '';
    if (votes.p1 === mapId) icons += '🔵';
    if (votes.p2 === mapId) icons += '🔴';
    el.textContent = icons;
  });
}

// ── Seleziona classe — usa event delegation sul container ──
document.querySelector('.classes-grid').addEventListener('click', (e) => {
  if (iAmReady) return;
  const card = e.target.closest('.class-card');
  if (!card) return;
  classCards.forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedClass = card.dataset.class;
  checkReadyBtn();
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'select_class', className: selectedClass }));
});

// ── Vota mappa — usa event delegation sul container ──
document.querySelector('.maps-grid').addEventListener('click', (e) => {
  if (iAmReady) return;
  const card = e.target.closest('.map-card');
  if (!card) return;
  mapCards.forEach(c => c.classList.remove('voted'));
  card.classList.add('voted');
  selectedMap = card.dataset.map;
  checkReadyBtn();
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'vote_map', mapId: selectedMap }));
});

// ── Ready ──
readyBtn.addEventListener('click', () => {
  if (!selectedClass || !selectedMap || iAmReady) return;
  iAmReady = true;
  readyBtn.textContent = 'WAITING...';
  readyBtn.disabled = true;
  ws.send(JSON.stringify({ type: 'player_ready' }));
});

// ── WebSocket ──
function connect() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/webapp2/ws`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join_match', matchId, userId: user.id, token }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {

      case 'joined':
        playerNumber = msg.playerNumber;
        csStatus.textContent = `You are Player ${playerNumber} — Choose class and map!`;
        break;

      case 'opponent_connected':
        opponentStatus.textContent = '✅ Opponent connected!';
        break;

      case 'class_selected':
        if (msg.playerNumber !== playerNumber)
          opponentStatus.textContent = '✅ Opponent chose a class!';
        break;

      case 'map_voted':
        updateMapVotes(msg.votes);
        if (msg.playerNumber !== playerNumber)
          opponentStatus.textContent = '✅ Opponent voted a map!';
        break;

      case 'map_decided':
        mapCards.forEach(c => c.classList.remove('decided'));
        document.querySelector(`.map-card[data-map="${msg.mapId}"]`)?.classList.add('decided');
        if (mapDecided) mapDecided.textContent = `🗺️ MAP: ${msg.mapName.toUpperCase()}`;
        break;

      case 'player_ready':
        if (msg.playerNumber !== playerNumber)
          opponentStatus.textContent = '✅ Opponent is READY!';
        break;

      case 'opponent_joined':
        csStatus.textContent = 'Both ready! Starting...';
        break;

      case 'countdown':
        csStatus.textContent = `Starting in ${msg.seconds}...`;
        break;

      case 'game_start':
        window.location.href = `/webapp2/game.html?matchId=${matchId}`;
        break;

      case 'error':
        alert(msg.message);
        window.location.href = '/webapp2/dashboard.html';
        break;
    }
  };

  ws.onclose = () => { csStatus.textContent = 'Connection lost...'; };

  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: 'heartbeat' }));
  }, 5000);
}

connect();