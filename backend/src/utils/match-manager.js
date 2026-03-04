import pool from './db.js';

export async function updateMatchStatus(matchId, status, winnerId = null) {
  const conn = await pool.getConnection();
  try {
    if (winnerId) {
      await conn.query(
        'UPDATE matches SET status = ?, winner_id = ? WHERE id = ?',
        [status, winnerId, matchId]
      );
    } else {
      await conn.query(
        'UPDATE matches SET status = ? WHERE id = ?',
        [status, matchId]
      );
    }
  } finally {
    conn.release();
  }
}

export async function saveMatchResults(matchId, winnerId, loserId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // Calcola punteggi totali attuali
    const [winnerRows] = await conn.query(
      'SELECT COALESCE(SUM(score_change), 0) as total FROM scores WHERE player_id = ?',
      [winnerId]
    );
    const [loserRows] = await conn.query(
      'SELECT COALESCE(SUM(score_change), 0) as total FROM scores WHERE player_id = ?',
      [loserId]
    );
    
    const winnerPrevScore = winnerRows[0].total;
    const loserPrevScore = loserRows[0].total;
    
    // Inserisci score changes
    await conn.query(
      'INSERT INTO scores (match_id, player_id, score, score_change) VALUES (?, ?, ?, ?)',
      [matchId, winnerId, winnerPrevScore + 10, 10]
    );
    await conn.query(
      'INSERT INTO scores (match_id, player_id, score, score_change) VALUES (?, ?, ?, ?)',
      [matchId, loserId, loserPrevScore - 5, -5]
    );
    
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
