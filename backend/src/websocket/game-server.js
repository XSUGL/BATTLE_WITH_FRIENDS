import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { GameRoom } from './game-room.js';

const rooms = new Map();

export function createGameServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        if      (message.type === 'join_match')   await handleJoinMatch(ws, message);
        else if (message.type === 'select_class')  handleSelectClass(ws, message);
        else if (message.type === 'vote_map')      handleVoteMap(ws, message);
        else if (message.type === 'player_ready')  handlePlayerReady(ws);
        else if (message.type === 'game_ready')    handleGameReady(ws);
        else if (message.type === 'input')         handleInput(ws, message);
        else if (message.type === 'forfeit')       handleForfeit(ws);
        else if (message.type === 'heartbeat')     ws.lastHeartbeat = Date.now();
      } catch (error) {
        console.error('WS message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      }
    });

    ws.on('close', () => handleDisconnect(ws));
  });

  return wss;
}

async function handleJoinMatch(ws, message) {
  const { matchId, userId, token } = message;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.id !== userId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      return;
    }
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
    return;
  }

  let room = rooms.get(matchId);
  if (!room) {
    // Passa callback di cleanup: la room si auto-elimina dal Map a fine partita
    room = new GameRoom(matchId, (id) => rooms.delete(id));
    rooms.set(matchId, room);
  }

  // Se la room esiste ma è già finita, NON ammettere nessuno: si stava
  // probabilmente cercando di rientrare in un match già concluso.
  // Senza questo check, il client riceverebbe 'joined' e stato vecchio.
  if (room.status === 'ended') {
    ws.send(JSON.stringify({ type: 'error', message: 'Match already ended' }));
    return;
  }

  // Rejoin: aggiorna solo il WS se userId già presente
  let playerNumber = null;
  if (room.player1?.userId === userId) {
    // Chiudi eventuale WS precedente per evitare due socket attivi sullo stesso slot
    try { if (room.player1.ws && room.player1.ws !== ws && room.player1.ws.readyState === 1) room.player1.ws.close(); } catch {}
    room.player1.ws = ws;
    playerNumber = 1;
  } else if (room.player2?.userId === userId) {
    try { if (room.player2.ws && room.player2.ws !== ws && room.player2.ws.readyState === 1) room.player2.ws.close(); } catch {}
    room.player2.ws = ws;
    playerNumber = 2;
  } else {
    playerNumber = await room.addPlayer(ws, userId);
  }

  if (!playerNumber) return;

  ws.matchId = matchId;
  ws.userId = userId;
  ws.playerNumber = playerNumber;
  ws.lastHeartbeat = Date.now();

  ws.send(JSON.stringify({ type: 'joined', playerId: userId, playerNumber }));

  // Rejoin su game.html — manda lo stato corrente, il game loop
  // partirà solo quando entrambi mandano 'game_ready'
  if (room.status === 'ready_to_start' || room.status === 'playing') {
    ws.send(JSON.stringify({
      type: 'game_start',
      initialState: room.gameState.toJSON(),
      classes: { p1: room.class1, p2: room.class2 },
      mapId: room.mapId
    }));
    return;
  }

  // Se sto entrando in una room dove l'avversario era già presente e
  // aveva già fatto delle scelte (classe, voto mappa), inviamele subito
  // così la UI del nuovo arrivato non resta "vuota"
  const opponentNumber = playerNumber === 1 ? 2 : 1;
  const opponent = playerNumber === 1 ? room.player2 : room.player1;
  if (opponent) {
    if (opponent.class) {
      ws.send(JSON.stringify({ type: 'class_selected', playerNumber: opponentNumber, className: opponent.class }));
    }
    if (Object.keys(room.mapVotes).length > 0) {
      ws.send(JSON.stringify({ type: 'map_voted', playerNumber: opponentNumber, mapId: room.mapVotes[`p${opponentNumber}`], votes: room.mapVotes }));
    }
    if (room.readyPlayers.has(opponentNumber)) {
      ws.send(JSON.stringify({ type: 'player_ready', playerNumber: opponentNumber, readyCount: room.readyPlayers.size }));
    }
  }

  if (room.isFull()) {
    room.broadcast({
      type: 'opponent_connected',
      message: 'Opponent connected! Choose your class.'
    });
  }
}

// Chiamato da game.html appena caricato e pronto
function handleGameReady(ws) {
  const room = rooms.get(ws.matchId);
  if (!room) return;
  room.playerGameReady(ws.playerNumber);
}

function handleSelectClass(ws, message) {
  const room = rooms.get(ws.matchId);
  if (room) room.setPlayerClass(ws.playerNumber, message.className);
}

function handlePlayerReady(ws) {
  const room = rooms.get(ws.matchId);
  if (room) room.playerReady(ws.playerNumber);
}

function handleInput(ws, message) {
  const room = rooms.get(ws.matchId);
  if (room) room.updatePlayerInput(ws.playerNumber, message.keys);
}

function handleVoteMap(ws, message) {
  const room = rooms.get(ws.matchId);
  if (room) room.voteMap(ws.playerNumber, message.mapId);
}

function handleForfeit(ws) {
  const room = rooms.get(ws.matchId);
  if (room) room.forfeit(ws.playerNumber);
}

function handleDisconnect(ws) {
  const room = rooms.get(ws.matchId);
  if (!room) return;
  // Se il ws che si chiude è già stato sostituito da un rejoin con un nuovo
  // WebSocket (caso transizione character-select → game.html), NON marcare
  // il giocatore come disconnesso: il nuovo WS è ancora attivo.
  const isStillCurrentP1 = room.player1?.ws === ws;
  const isStillCurrentP2 = room.player2?.ws === ws;
  if (!isStillCurrentP1 && !isStillCurrentP2) return;
  room.playerDisconnected(ws.playerNumber);
}

setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, matchId) => {
    if (room.isInactive(now)) rooms.delete(matchId);
  });
}, 30000);