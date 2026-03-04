import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { GameRoom } from './game-room.js';

const rooms = new Map(); // matchId → GameRoom

export function createGameServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });
  
  wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        
        if (message.type === 'join_match') {
          await handleJoinMatch(ws, message);
        } else if (message.type === 'input') {
          handleInput(ws, message);
        } else if (message.type === 'forfeit') {
          handleForfeit(ws);
        } else if (message.type === 'heartbeat') {
          ws.lastHeartbeat = Date.now();
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      }
    });
    
    ws.on('close', () => {
      handleDisconnect(ws);
    });
  });
  
  return wss;
}

async function handleJoinMatch(ws, message) {
  const { matchId, userId, token } = message;
  
  // Verifica JWT
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.id !== userId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      return;
    }
  } catch (error) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
    return;
  }
  
  // Trova o crea stanza
  let room = rooms.get(matchId);
  if (!room) {
    room = new GameRoom(matchId);
    rooms.set(matchId, room);
  }
  
  // Aggiungi giocatore alla stanza
  const playerNumber = await room.addPlayer(ws, userId);
  
  ws.matchId = matchId;
  ws.userId = userId;
  ws.playerNumber = playerNumber;
  ws.lastHeartbeat = Date.now();
  
  // Invia conferma
  ws.send(JSON.stringify({
    type: 'joined',
    playerId: userId,
    playerNumber: playerNumber
  }));
  
  // Se entrambi i giocatori sono connessi, inizia il countdown
  if (room.isFull()) {
    room.startCountdown();
  }
}

function handleInput(ws, message) {
  const room = rooms.get(ws.matchId);
  if (room) {
    room.updatePlayerInput(ws.playerNumber, message.keys);
  }
}

function handleForfeit(ws) {
  const room = rooms.get(ws.matchId);
  if (room) {
    room.forfeit(ws.playerNumber);
  }
}

function handleDisconnect(ws) {
  const room = rooms.get(ws.matchId);
  if (room) {
    room.playerDisconnected(ws.playerNumber);
  }
}

// Cleanup heartbeat ogni 30 secondi
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, matchId) => {
    if (room.isInactive(now)) {
      console.log(`Removing inactive room ${matchId}`);
      rooms.delete(matchId);
    }
  });
}, 30000);
