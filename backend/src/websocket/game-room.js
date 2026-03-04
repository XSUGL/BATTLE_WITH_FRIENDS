import { GameState } from '../game/game-state.js';
import { updateMatchStatus, saveMatchResults } from '../utils/match-manager.js';

export class GameRoom {
  constructor(matchId) {
    this.matchId = matchId;
    this.player1 = null;
    this.player2 = null;
    this.gameState = null;
    this.gameLoopInterval = null;
    this.status = 'waiting'; // waiting | countdown | playing | ended
  }
  
  async addPlayer(ws, userId) {
    if (!this.player1) {
      this.player1 = { ws, userId, input: { up: false, down: false, left: false, right: false } };
      return 1;
    } else if (!this.player2) {
      this.player2 = { ws, userId, input: { up: false, down: false, left: false, right: false } };
      return 2;
    } else {
      ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
      return null;
    }
  }
  
  isFull() {
    return this.player1 && this.player2;
  }
  
  async startCountdown() {
    this.status = 'countdown';
    this.broadcast({ type: 'opponent_joined' });
    
    // Aggiorna match status nel database
    await updateMatchStatus(this.matchId, 'active');
    
    for (let i = 3; i > 0; i--) {
      this.broadcast({ type: 'countdown', seconds: i });
      await this.sleep(1000);
    }
    
    this.startGame();
  }
  
  startGame() {
    this.status = 'playing';
    this.gameState = new GameState();
    
    this.broadcast({
      type: 'game_start',
      initialState: this.gameState.toJSON()
    });
    
    // Game loop a 60 FPS
    this.gameLoopInterval = setInterval(() => {
      this.update();
    }, 1000 / 60);
  }
  
  update() {
    if (this.status !== 'playing') return;
    
    // Aggiorna stato con input giocatori
    this.gameState.update(this.player1.input, this.player2.input);
    
    // Invia stato a entrambi i client
    this.broadcast({
      type: 'state_update',
      state: this.gameState.toJSON()
    });
    
    // Controlla vittoria
    const winner = this.gameState.checkWinner();
    if (winner) {
      this.endGame(winner, 'score_reached');
    }
    
    // Controlla timeout (3 minuti)
    if (this.gameState.timeRemaining <= 0) {
      const winner = this.gameState.getWinnerByScore();
      this.endGame(winner, 'timeout');
    }
  }
  
  async endGame(winnerNumber, reason) {
    clearInterval(this.gameLoopInterval);
    this.status = 'ended';
    
    const winnerId = winnerNumber === 1 ? this.player1.userId : this.player2.userId;
    const loserId = winnerNumber === 1 ? this.player2.userId : this.player1.userId;
    
    // Salva risultati nel database
    await updateMatchStatus(this.matchId, 'completed', winnerId);
    await saveMatchResults(this.matchId, winnerId, loserId);
    
    // Notifica i client
    this.broadcast({
      type: 'game_over',
      winner: winnerNumber,
      reason: reason,
      finalScores: {
        player1: this.gameState.player1.score,
        player2: this.gameState.player2.score
      }
    });
  }
  
  forfeit(playerNumber) {
    const winner = playerNumber === 1 ? 2 : 1;
    this.endGame(winner, 'forfeit');
  }
  
  playerDisconnected(playerNumber) {
    if (this.status === 'playing') {
      const winner = playerNumber === 1 ? 2 : 1;
      this.endGame(winner, 'disconnect');
    }
  }
  
  updatePlayerInput(playerNumber, keys) {
    if (playerNumber === 1 && this.player1) {
      this.player1.input = keys;
    } else if (playerNumber === 2 && this.player2) {
      this.player2.input = keys;
    }
  }
  
  broadcast(message) {
    const data = JSON.stringify(message);
    if (this.player1?.ws.readyState === 1) this.player1.ws.send(data);
    if (this.player2?.ws.readyState === 1) this.player2.ws.send(data);
  }
  
  isInactive(now) {
    const timeout = 5 * 60 * 1000; // 5 minuti
    if (!this.player1?.ws.lastHeartbeat || !this.player2?.ws.lastHeartbeat) return false;
    return (now - this.player1.ws.lastHeartbeat > timeout) ||
           (now - this.player2.ws.lastHeartbeat > timeout);
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
