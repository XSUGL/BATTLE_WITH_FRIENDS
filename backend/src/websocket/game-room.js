import { GameState, CLASSES, MAPS } from '../game/game-state.js';
import pool from '../utils/db.js';
import { updateMatchStatus, completeMatch, findMatchById } from '../models/match-model.js';
import { saveMatchResults } from '../models/score-model.js';
import { advanceTournamentAfterMatch } from '../models/tournament-model.js';

export class GameRoom {
  constructor(matchId, onCleanup = null) {
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
    // Ruoli letti dal DB: { p1: <user_id>, p2: <user_id> }
    this.roles = null;
    // Callback invocato per rimuovere la room dal Map quando finita
    this._onCleanup = onCleanup;
    this._cleanupScheduled = false;
  }

  async loadRoles() {
    if (this.roles) return this.roles;
    const m = await findMatchById(this.matchId);
    if (m) {
      this.roles = { p1: m.player1_id, p2: m.player2_id };
      // Match di torneo: propaghiamo i metadati così il client può tornare
      // alla pagina del torneo dopo game_over.
      this.tournamentId = m.tournament_id ?? null;
      this.tournamentRound = m.round ?? null;
    }
    return this.roles;
  }

  async addPlayer(ws, userId) {
    const roles = await this.loadRoles();
    if (!roles) {
      ws.send(JSON.stringify({ type: 'error', message: 'Match not found' }));
      return null;
    }

    if (userId === roles.p1) {
      if (this.player1) {
        ws.send(JSON.stringify({ type: 'error', message: 'Player1 slot busy' }));
        return null;
      }
      this.player1 = { ws, userId, input: { up: false, down: false, left: false, right: false }, class: 'knight' };
      return 1;
    }

    if (userId === roles.p2) {
      if (this.player2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Player2 slot busy' }));
        return null;
      }
      this.player2 = { ws, userId, input: { up: false, down: false, left: false, right: false }, class: 'warrior' };
      return 2;
    }

    ws.send(JSON.stringify({ type: 'error', message: 'You are not part of this match' }));
    return null;
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
    this.gameLoopInterval = null;
    this.status = 'ended';
    const winnerId = winnerNumber === 1 ? this.player1?.userId : this.player2?.userId;
    const loserId  = winnerNumber === 1 ? this.player2?.userId : this.player1?.userId;

    if (winnerId && loserId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await completeMatch(this.matchId, winnerId, conn);
        await saveMatchResults(this.matchId, winnerId, loserId, conn);
        // Se questo era un match di torneo, avanza il bracket nella stessa
        // transazione (eventuale match successivo creato, vincitore di
        // torneo con bonus +30, partecipanti eliminati aggiornati).
        try {
          await advanceTournamentAfterMatch(this.matchId, winnerId, loserId, conn);
        } catch (e) {
          // Non rompiamo il salvataggio del match per un errore di avanzamento
          console.error('Tournament advance error:', e);
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        console.error('endGame DB error:', e);
      } finally {
        conn.release();
      }
    }

    this.broadcast({
      type: 'game_over', winner: winnerNumber, reason,
      finalHp: {
        player1: this.gameState?.player1?.hp ?? 0,
        player2: this.gameState?.player2?.hp ?? 0
      },
      tournamentId: this.tournamentId ?? null,
      tournamentRound: this.tournamentRound ?? null
    });

    // Pulisci la room dal Map dopo che i client hanno avuto il tempo
    // di ricevere game_over e fare il redirect alla dashboard.
    // Senza questo, vecchie room restano in memoria e possono confondere
    // join successivi sulla stessa partita (state pollution).
    this._scheduleCleanup(8000);
  }

  _scheduleCleanup(delayMs = 5000) {
    if (this._cleanupScheduled) return;
    this._cleanupScheduled = true;
    setTimeout(() => {
      try {
        if (this.gameLoopInterval) {
          clearInterval(this.gameLoopInterval);
          this.gameLoopInterval = null;
        }
        // Chiudi eventuali WS ancora aperti per liberare risorse
        try { if (this.player1?.ws?.readyState === 1) this.player1.ws.close(); } catch {}
        try { if (this.player2?.ws?.readyState === 1) this.player2.ws.close(); } catch {}
        this.player1 = null;
        this.player2 = null;
        this.gameState = null;
        if (typeof this._onCleanup === 'function') this._onCleanup(this.matchId);
      } catch (e) {
        console.error('Room cleanup error:', e);
      }
    }, delayMs);
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
    try { if (this.player1?.ws?.readyState === 1) this.player1.ws.send(data); } catch (e) { console.warn('broadcast p1 failed:', e?.message); }
    try { if (this.player2?.ws?.readyState === 1) this.player2.ws.send(data); } catch (e) { console.warn('broadcast p2 failed:', e?.message); }
  }

  isInactive(now) {
    const timeout = 5 * 60 * 1000;
    // Room conclusa: cleanup veloce (di solito gestito da _scheduleCleanup,
    // ma fallback se qualcosa è andato storto)
    if (this.status === 'ended') return true;
    // Nessun player presente — la room è orfana
    if (!this.player1 && !this.player2) return true;
    // Recupera heartbeat in modo null-safe
    const hb1 = this.player1?.ws?.lastHeartbeat ?? null;
    const hb2 = this.player2?.ws?.lastHeartbeat ?? null;
    // Stale = nessun heartbeat ricevuto o heartbeat troppo vecchio
    const stale1 = !this.player1 || hb1 === null || (now - hb1 > timeout);
    const stale2 = !this.player2 || hb2 === null || (now - hb2 > timeout);
    // Considera inattiva solo se ENTRAMBI gli slot sono stale
    return stale1 && stale2;
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}