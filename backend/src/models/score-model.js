import pool from '../utils/db.js';

// 1. Funzione di supporto per ottenere il punteggio di un singolo giocatore
export async function getPlayerTotalScore(playerId, conn) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    const [rows] = await connection.execute(
      'SELECT COALESCE(SUM(score_change), 0) as total_score FROM scores WHERE player_id = ?',
      [playerId]
    );
    return Number(rows[0].total_score);
  } finally {
    if (shouldRelease) connection.release();
  }
}

// 2. Funzione per salvare i risultati a fine partita
export async function saveMatchResults(matchId, winnerId, loserId, conn) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;

  try {
    // Leggi il punteggio attuale
    const winnerPrev = await getPlayerTotalScore(winnerId, connection);
    const loserPrev  = await getPlayerTotalScore(loserId, connection);

    // Calcola i nuovi punteggi
    const winnerNew = winnerPrev + 10;
    const loserNew  = loserPrev  - 5;

    // Inserisci i record
    await connection.execute(
      'INSERT INTO scores (match_id, player_id, score, score_change) VALUES (?, ?, ?, ?)',
      [matchId, winnerId, winnerNew, 10]
    );
    
    await connection.execute(
      'INSERT INTO scores (match_id, player_id, score, score_change) VALUES (?, ?, ?, ?)',
      [matchId, loserId, loserNew, -5]
    );

    return { 
      winner: { id: winnerId, score: winnerNew, scoreChange: 10 }, 
      loser: { id: loserId, score: loserNew, scoreChange: -5 } 
    };
  } finally {
    if (shouldRelease) connection.release();
  }
}

// 3. Funzione per ottenere la classifica generale
export async function getLeaderboard(currentUserId) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT u.id as user_id, u.username, COALESCE(SUM(s.score_change), 0) as total_score 
       FROM users u 
       LEFT JOIN scores s ON u.id = s.player_id 
       GROUP BY u.id, u.username 
       ORDER BY total_score DESC, u.id ASC`
    );

    const leaderboard = [];
    let currentRank = 1;
    let previousScore = null;

    for (let i = 0; i < rows.length; i++) {
      const score = Number(rows[i].total_score);
      
      if (previousScore !== null && score !== previousScore) {
        currentRank = i + 1;
      }

      leaderboard.push({
        rank: currentRank,
        userId: rows[i].user_id,
        username: rows[i].username,
        totalScore: score
      });

      previousScore = score;
    }

    return leaderboard;
  } catch (error) {
    console.error('❌ Errore in getLeaderboard:', error);
    throw error;
  } finally {
    conn.release();
  }
}