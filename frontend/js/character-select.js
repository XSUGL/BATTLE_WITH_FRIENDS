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
let heartbeatIntervalId = null;
let reconnectAttempts = 0;
let intentionalClose = false;
// Coda dei messaggi da spedire se il WS non è ancora OPEN
// (succede se l'utente clicca prima che la connessione sia pronta
// o durante una riconnessione automatica).
const pendingMessages = [];

function safeSend(payload) {
  const data = JSON.stringify(payload);
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(data); return true; }
    catch (err) { console.warn('WS send failed, queueing:', err); }
  }
  // Non aperto: accoda. Verrà flushato in onopen.
  // Evita di accodare heartbeat (sono usa-e-getta).
  if (payload?.type !== 'heartbeat') pendingMessages.push(data);
  return false;
}

function flushPending() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  while (pendingMessages.length) {
    const data = pendingMessages.shift();
    try { ws.send(data); } catch (err) {
      console.warn('WS flush failed, re-queueing:', err);
      pendingMessages.unshift(data);
      break;
    }
  }
}

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
  safeSend({ type: 'select_class', className: selectedClass });
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
  safeSend({ type: 'vote_map', mapId: selectedMap });
});

// ── Ready ──
readyBtn.addEventListener('click', () => {
  if (!selectedClass || !selectedMap || iAmReady) return;
  iAmReady = true;
  readyBtn.textContent = 'WAITING...';
  readyBtn.disabled = true;
  // Se il WS non è ancora OPEN il messaggio viene accodato e spedito
  // automaticamente all'onopen (vedi flushPending) — niente InvalidStateError.
  safeSend({ type: 'player_ready' });
});

// ── WebSocket ──
function connect() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/webapp2/ws`;

  // Cleanup eventuale connessione precedente
  if (ws) {
    try { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; } catch {}
    try { ws.close(); } catch {}
  }

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    reconnectAttempts = 0;
    csStatus.textContent = 'Connecting to match...';
    // SOLO join_match qui. NON flushare adesso: handleJoinMatch sul server è
    // async (await DB) e qualsiasi messaggio successivo arriverebbe prima che
    // ws.matchId sia settato → handler lato server fa rooms.get(undefined) e
    // ignora silenziosamente. Il flush parte all'arrivo di 'joined'.
    try { ws.send(JSON.stringify({ type: 'join_match', matchId, userId: user.id, token })); }
    catch (err) { console.warn('join_match send failed:', err); }
  };

  ws.onerror = () => {
    csStatus.textContent = 'Connection error, retrying...';
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {

      case 'joined':
        playerNumber = msg.playerNumber;
        csStatus.textContent = `You are Player ${playerNumber} — Choose class and map!`;
        // Ora che il server ha registrato la join (ws.matchId è set lato
        // server), è sicuro spedire le scelte/Ready accodate.
        flushPending();
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
        intentionalClose = true;
        stopHeartbeat();
        try { ws.close(); } catch {}
        window.location.href = `/webapp2/game.html?matchId=${matchId}`;
        break;

      case 'error':
        intentionalClose = true;
        stopHeartbeat();
        try { ws.close(); } catch {}
        alert(msg.message);
        window.location.href = '/webapp2/dashboard.html';
        break;
    }
  };

  ws.onclose = () => {
    stopHeartbeat();
    if (intentionalClose) return;
    // Riconnessione automatica con backoff (max 5 tentativi)
    if (reconnectAttempts < 5) {
      reconnectAttempts++;
      csStatus.textContent = `Connection lost — retry ${reconnectAttempts}/5...`;
      setTimeout(connect, 800 * reconnectAttempts);
    } else {
      csStatus.textContent = 'Connection lost — please reload the page.';
    }
  };

  startHeartbeat();
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatIntervalId = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'heartbeat' })); }
      catch { /* socket morto fra il check e il send: amen, ci pensa onclose */ }
    }
  }, 5000);
}

function stopHeartbeat() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

window.addEventListener('beforeunload', () => {
  intentionalClose = true;
  stopHeartbeat();
  try { ws?.close(); } catch {}
});

connect();