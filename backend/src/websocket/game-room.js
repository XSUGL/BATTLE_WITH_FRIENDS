import { GameState, CLASSES, MAPS } from '../game/game-state.js';
import pool from '../utils/db.js';
import { updateMatchStatus, completeMatch } from '../models/match-model.js';
import { saveMatchResults } from '../models/score-model.js';

export class GameRoom {
  constructor(matchId) {
    this.matchId = matchId;
    this.player1 = null;
    this.player2 = null;
    this.gameState = null;
    this.gameLoopInterval = null;
    this.status = 'waiting';
    this.class1 = 'knight';
    this.class2 = 'warrior';
    this.mapId  = 'arena';
    this.readyPlayers    = new Set();
    this.gameReadyPlayers = new Set();
    // Voti mappa: { p1: 'arena', p2: 'space' }
    this.mapVotes = {};
  }

  async addPlayer(ws, userId) {
    if (!this.player1) {
      this.player1 = { ws, userId, input: { up: false, down: false, left: false, right: false }, class: 'knight' };
      return 1;
    } else if (!this.player2) {
      this.player2 = { ws, userId, input: { up: false, down: false, left: false, right: false }, class: 'warrior' };
      return 2;
    } else {
      ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
      return null;
    }
  }

  setPlayerClass(playerNumber, className) {
    if (!Object.keys(CLASSES).includes(className)) return;
    if (playerNumber === 1 && this.player1) { this.player1.class = className; this.class1 = className; }
    if (playerNumber === 2 && this.player2) { this.player2.class = className; this.class2 = className; }
    this.broadcast({ type: 'class_selected', playerNumber, className });
  }

  voteMap(playerNumber, mapId) {
    if (!Object.keys(MAPS).includes(mapId)) return;
    this.mapVotes[`p${playerNumber}`] = mapId;
    this.broadcast({ type: 'map_voted', playerNumber, mapId, votes: this.mapVotes });

    // Se entrambi hanno votato, risolvi
    if (this.mapVotes.p1 && this.mapVotes.p2) {
      if (this.mapVotes.p1 === this.mapVotes.p2) {
        // Stesso voto — mappa scelta
        this.mapId = this.mapVotes.p1;
      } else {
        // Voti diversi — mappa random tra le due
        this.mapId = Math.random() < 0.5 ? this.mapVotes.p1 : this.mapVotes.p2;
      }
      this.broadcast({ type: 'map_decided', mapId: this.mapId, mapName: MAPS[this.mapId].name });
    }
  }

  playerReady(playerNumber) {
    if (this.readyPlayers.has(playerNumber)) return;
    this.readyPlayers.add(playerNumber);
    this.broadcast({ type: 'player_ready', playerNumber, readyCount: this.readyPlayers.size });
    if (this.readyPlayers.size >= 2 && this.status === 'waiting') {
      this.startCountdown();
    }
  }

  playerGameReady(playerNumber) {
    if (this.status !== 'ready_to_start') return;
    this.gameReadyPlayers.add(playerNumber);
    if (this.gameReadyPlayers.size >= 2) this.startGameLoop();
  }

  isFull() { return !!(this.player1 && this.player2); }

  async startCountdown() {
    this.status = 'countdown';
    this.broadcast({ type: 'opponent_joined' });
    await updateMatchStatus(this.matchId, 'active');
    for (let i = 3; i > 0; i--) {
      this.broadcast({ type: 'countdown', seconds: i });
      await this.sleep(1000);
    }
    this.prepareGame();
  }

  prepareGame() {
    this.status = 'ready_to_start';
    this.gameState = new GameState(this.class1, this.class2, this.mapId);
    this.broadcast({
      type: 'game_start',
      initialState: this.gameState.toJSON(),
      classes: { p1: this.class1, p2: this.class2 },
      mapId: this.mapId
    });
    setTimeout(() => {
      if (this.status === 'ready_to_start') this.startGameLoop();
    }, 10000);
  }

  startGameLoop() {
    if (this.status === 'playing') return;
    this.status = 'playing';
    this.gameLoopInterval = setInterval(() => { this.update(); }, 1000 / 60);
  }

  update() {
    if (this.status !== 'playing') return;
    this.gameState.update(this.player1.input, this.player2.input);
    this.broadcast({ type: 'state_update', state: this.gameState.toJSON() });
    const winner = this.gameState.checkWinner();
    if (winner) { this.endGame(winner, 'hp_depleted'); return; }
    if (this.gameState.timeRemaining <= 0) {
      this.endGame(this.gameState.getWinnerByScore(), 'timeout');
    }
  }

  async endGame(winnerNumber, reason) {
    if (this.status === 'ended') return;
    clearInterval(this.gameLoopInterval);
    this.status = 'ended';
    const winnerId = winnerNumber === 1 ? this.player1.userId : this.player2.userId;
    const loserId  = winnerNumber === 1 ? this.player2.userId : this.player1.userId;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await completeMatch(this.matchId, winnerId, conn);
      await saveMatchResults(this.matchId, winnerId, loserId, conn);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.error('endGame DB error:', e);
    } finally {
      conn.release();
    }
    this.broadcast({
      type: 'game_over', winner: winnerNumber, reason,
      finalHp: { player1: this.gameState.player1.hp, player2: this.gameState.player2.hp }
    });
  }

  forfeit(playerNumber) { this.endGame(playerNumber === 1 ? 2 : 1, 'forfeit'); }
  playerDisconnected(playerNumber) {
    if (this.status === 'playing') this.endGame(playerNumber === 1 ? 2 : 1, 'disconnect');
  }

  updatePlayerInput(playerNumber, keys) {
    if (playerNumber === 1 && this.player1) this.player1.input = keys;
    else if (playerNumber === 2 && this.player2) this.player2.input = keys;
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    if (this.player1?.ws.readyState === 1) this.player1.ws.send(data);
    if (this.player2?.ws.readyState === 1) this.player2.ws.send(data);
  }

  isInactive(now) {
    const timeout = 5 * 60 * 1000;
    if (!this.player1?.ws.lastHeartbeat || !this.player2?.ws.lastHeartbeat) return false;
    return (now - this.player1.ws.lastHeartbeat > timeout) || (now - this.player2.ws.lastHeartbeat > timeout);
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}