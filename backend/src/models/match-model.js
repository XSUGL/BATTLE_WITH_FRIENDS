import pool from '../utils/db.js';

export async function findMatchById(matchId, conn = null) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    const [result] = await connection.execute('SELECT * FROM matches WHERE id = ?', [matchId]);
    const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } finally {
    if (shouldRelease) connection.release();
  }
}

export async function updateMatchStatus(matchId, status, winnerId = null, conn = null) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    if (winnerId !== null) {
      await connection.execute(
        'UPDATE matches SET status = ?, winner_id = ? WHERE id = ?',
        [status, winnerId, matchId]
      );
    } else {
      await connection.execute(
        'UPDATE matches SET status = ? WHERE id = ?',
        [status, matchId]
      );
    }
    return true;
  } finally {
    if (shouldRelease) connection.release();
  }
}

export async function completeMatch(matchId, winnerId, conn = null) {
  return await updateMatchStatus(matchId, 'completed', winnerId, conn);
}

export async function getMatchHistory(userId, limit = 50, conn = null) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    const [result] = await connection.execute(
      `SELECT
         m.id, m.status, m.winner_id, m.created_at,
         CASE WHEN m.player1_id = ? THEN m.player2_id ELSE m.player1_id END as opponent_id,
         CASE WHEN m.player1_id = ? THEN u2.username ELSE u1.username END as opponent_username,
         s_user.score_change as my_score_change,
         s_opponent.score_change as opponent_score_change
       FROM matches m
       INNER JOIN users u1 ON m.player1_id = u1.id
       INNER JOIN users u2 ON m.player2_id = u2.id
       LEFT JOIN scores s_user ON m.id = s_user.match_id AND s_user.player_id = ?
       LEFT JOIN scores s_opponent ON m.id = s_opponent.match_id AND s_opponent.player_id = CASE WHEN m.player1_id = ? THEN m.player2_id ELSE m.player1_id END
       WHERE (m.player1_id = ? OR m.player2_id = ?) AND m.status IN ('completed', 'cancelled')
       ORDER BY m.created_at DESC LIMIT ?`,
      [userId, userId, userId, userId, userId, userId, limit]
    );

    const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;

    return (rows || []).map(row => {
      let resultStatus = 'loss';
      if (row.status === 'cancelled') resultStatus = 'cancelled';
      else if (row.winner_id === userId) resultStatus = 'win';

      return {
        id: row.id,
        status: row.status,
        result: resultStatus,
        // FIX APPLICATO QUI
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        opponentId: row.opponent_id,
        opponentUsername: row.opponent_username,
        myScoreChange: row.my_score_change || 0,
        opponentScoreChange: row.opponent_score_change || 0
      };
    });
  } finally {
    if (shouldRelease) connection.release();
  }
}

export async function createMatch(invitationId, player1Id, player2Id, conn = null) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    const [result] = await connection.execute(
      'INSERT INTO matches (player1_id, player2_id, status) VALUES (?, ?, "active")',
      [player1Id, player2Id]
    );
    return {
      id: Number(result.insertId),
      player1Id,
      player2Id,
      status: 'active'
    };
  } finally {
    if (shouldRelease) connection.release();
  }
}