import pool from '../utils/db.js';

const ALLOWED_SIZES = [2, 4, 8, 16, 32];
const TOURNAMENT_WIN_BONUS = 30; // punti extra al vincitore del torneo

export function isAllowedSize(size) {
  return ALLOWED_SIZES.includes(Number(size));
}

export function totalRoundsFor(size) {
  return Math.log2(Number(size));
}

// ── CRUD base ──────────────────────────────────────────────────────────────

export async function createTournament({ name, size, creatorId }, conn = null) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    const [result] = await connection.execute(
      `INSERT INTO tournaments (name, size, creator_id, status) VALUES (?, ?, ?, 'lobby')`,
      [name, size, creatorId]
    );
    const id = Number(result.insertId);
    // Il creatore entra automaticamente come primo partecipante
    await connection.execute(
      `INSERT INTO tournament_participants (tournament_id, user_id) VALUES (?, ?)`,
      [id, creatorId]
    );
    return { id, name, size, creatorId, status: 'lobby' };
  } finally {
    if (shouldRelease) connection.release();
  }
}

export async function findTournamentById(id, conn = null) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    const [rows] = await connection.execute(
      `SELECT id, name, size, creator_id, status, winner_id, created_at, started_at, completed_at
       FROM tournaments WHERE id = ?`,
      [id]
    );
    const r = (Array.isArray(rows) && Array.isArray(rows[0])) ? rows[0] : rows;
    if (!r || r.length === 0) return null;
    const row = r[0];
    return {
      id: row.id,
      name: row.name,
      size: Number(row.size),
      creatorId: row.creator_id,
      status: row.status,
      winnerId: row.winner_id ?? null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null
    };
  } finally {
    if (shouldRelease) connection.release();
  }
}

export async function listTournaments({ statuses = ['lobby', 'running'], limit = 50 } = {}) {
  const conn = await pool.getConnection();
  try {
    const placeholders = statuses.map(() => '?').join(',');
    const [rows] = await conn.execute(
      `SELECT t.id, t.name, t.size, t.creator_id, t.status, t.winner_id, t.created_at,
              uc.username AS creator_username,
              uw.username AS winner_username,
              (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) AS participants_count
       FROM tournaments t
       JOIN users uc ON t.creator_id = uc.id
       LEFT JOIN users uw ON t.winner_id = uw.id
       WHERE t.status IN (${placeholders})
       ORDER BY t.created_at DESC
       LIMIT ?`,
      [...statuses, limit]
    );
    const r = (Array.isArray(rows) && Array.isArray(rows[0])) ? rows[0] : rows;
    return (r || []).map(row => ({
      id: row.id,
      name: row.name,
      size: Number(row.size),
      creatorId: row.creator_id,
      creatorUsername: row.creator_username,
      status: row.status,
      winnerId: row.winner_id ?? null,
      winnerUsername: row.winner_username ?? null,
      participantsCount: Number(row.participants_count),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
    }));
  } finally {
    conn.release();
  }
}

export async function getParticipants(tournamentId, conn = null) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    const [rows] = await connection.execute(
      `SELECT tp.user_id, u.username, tp.seed, tp.eliminated_at, tp.joined_at
       FROM tournament_participants tp
       JOIN users u ON tp.user_id = u.id
       WHERE tp.tournament_id = ?
       ORDER BY tp.joined_at ASC`,
      [tournamentId]
    );
    const r = (Array.isArray(rows) && Array.isArray(rows[0])) ? rows[0] : rows;
    return (r || []).map(row => ({
      userId: row.user_id,
      username: row.username,
      seed: row.seed ?? null,
      eliminatedAt: row.eliminated_at ?? null,
      joinedAt: row.joined_at ? new Date(row.joined_at).toISOString() : null
    }));
  } finally {
    if (shouldRelease) connection.release();
  }
}

// ── Join (con auto-start atomico quando si riempie) ────────────────────────

/**
 * Aggiunge userId al torneo. Se così facendo si raggiunge `size`, lo start
 * del torneo (status='running', generazione match round 1, assegnazione seed)
 * avviene nella stessa transazione: niente race con join concorrenti.
 *
 * Errori: 'NOT_FOUND' | 'NOT_OPEN' | 'ALREADY_JOINED' | 'FULL'
 * Ritorna: { tournament, justStarted: bool }
 */
export async function joinTournament(tournamentId, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock della riga torneo per serializzare i join concorrenti
    const [tRows] = await conn.execute(
      `SELECT id, size, status FROM tournaments WHERE id = ? FOR UPDATE`,
      [tournamentId]
    );
    const tArr = (Array.isArray(tRows) && Array.isArray(tRows[0])) ? tRows[0] : tRows;
    if (!tArr || tArr.length === 0) {
      await conn.rollback();
      const e = new Error('Tournament not found'); e.code = 'NOT_FOUND'; throw e;
    }
    const t = tArr[0];
    if (t.status !== 'lobby') {
      await conn.rollback();
      const e = new Error('Tournament is not open for joining'); e.code = 'NOT_OPEN'; throw e;
    }

    // Già iscritto?
    const [pRows] = await conn.execute(
      `SELECT user_id FROM tournament_participants WHERE tournament_id = ? AND user_id = ?`,
      [tournamentId, userId]
    );
    const pArr = (Array.isArray(pRows) && Array.isArray(pRows[0])) ? pRows[0] : pRows;
    if (pArr && pArr.length > 0) {
      await conn.rollback();
      const e = new Error('Already joined'); e.code = 'ALREADY_JOINED'; throw e;
    }

    // Conta partecipanti attuali (sotto lock implicito sui join concorrenti
    // grazie al SELECT ... FOR UPDATE sopra)
    const [cRows] = await conn.execute(
      `SELECT COUNT(*) AS c FROM tournament_participants WHERE tournament_id = ?`,
      [tournamentId]
    );
    const cArr = (Array.isArray(cRows) && Array.isArray(cRows[0])) ? cRows[0] : cRows;
    const current = Number(cArr[0].c);
    if (current >= Number(t.size)) {
      await conn.rollback();
      const e = new Error('Tournament is full'); e.code = 'FULL'; throw e;
    }

    await conn.execute(
      `INSERT INTO tournament_participants (tournament_id, user_id) VALUES (?, ?)`,
      [tournamentId, userId]
    );

    let justStarted = false;
    if (current + 1 === Number(t.size)) {
      await _startTournament(tournamentId, Number(t.size), conn);
      justStarted = true;
    }

    await conn.commit();
    const tournament = await findTournamentById(tournamentId);
    return { tournament, justStarted };
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

// ── Bracket generation & advancement ───────────────────────────────────────

/**
 * Internal: chiamato dentro la transazione di joinTournament quando il torneo
 * si riempie. Assegna seed (ordine di join), crea i match del round 1, marca
 * status='running' e started_at.
 */
async function _startTournament(tournamentId, size, conn) {
  // Assegna seed 1..size in ordine di join
  const [pRows] = await conn.execute(
    `SELECT user_id FROM tournament_participants
     WHERE tournament_id = ? ORDER BY joined_at ASC, user_id ASC`,
    [tournamentId]
  );
  const pArr = (Array.isArray(pRows) && Array.isArray(pRows[0])) ? pRows[0] : pRows;
  const userIds = pArr.map(r => r.user_id);

  for (let i = 0; i < userIds.length; i++) {
    await conn.execute(
      `UPDATE tournament_participants SET seed = ? WHERE tournament_id = ? AND user_id = ?`,
      [i + 1, tournamentId, userIds[i]]
    );
  }

  // Genera i match del round 1 a coppie (1v2, 3v4, ...)
  const round = 1;
  for (let i = 0; i < userIds.length; i += 2) {
    const slot = i / 2;            // 0-based
    const p1 = userIds[i];
    const p2 = userIds[i + 1];
    await conn.execute(
      `INSERT INTO matches (player1_id, player2_id, status, tournament_id, round, bracket_slot)
       VALUES (?, ?, 'pending', ?, ?, ?)`,
      [p1, p2, tournamentId, round, slot]
    );
  }

  await conn.execute(
    `UPDATE tournaments SET status = 'running', started_at = NOW() WHERE id = ?`,
    [tournamentId]
  );
}

/**
 * Restituisce tutti i match di un torneo, raggruppati per round.
 * Usato dalla pagina bracket. Pubblico (no auth).
 */
export async function getBracket(tournamentId, conn = null) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    const [rows] = await connection.execute(
      `SELECT m.id, m.player1_id, m.player2_id, m.status, m.winner_id, m.round, m.bracket_slot,
              u1.username AS p1_username, u2.username AS p2_username, uw.username AS winner_username
       FROM matches m
       JOIN users u1 ON m.player1_id = u1.id
       JOIN users u2 ON m.player2_id = u2.id
       LEFT JOIN users uw ON m.winner_id = uw.id
       WHERE m.tournament_id = ?
       ORDER BY m.round ASC, m.bracket_slot ASC`,
      [tournamentId]
    );
    const r = (Array.isArray(rows) && Array.isArray(rows[0])) ? rows[0] : rows;
    return (r || []).map(row => ({
      id: row.id,
      round: row.round,
      bracketSlot: row.bracket_slot,
      status: row.status,
      player1Id: row.player1_id,
      player1Username: row.p1_username,
      player2Id: row.player2_id,
      player2Username: row.p2_username,
      winnerId: row.winner_id ?? null,
      winnerUsername: row.winner_username ?? null
    }));
  } finally {
    if (shouldRelease) connection.release();
  }
}

/**
 * Trova il prossimo match (pending o active) in cui userId è coinvolto.
 * Serve al polling del dashboard: appena viene creato il match del round
 * successivo, il client viene rediretto alla character-select.
 */
export async function findOpenTournamentMatchForUser(userId, conn = null) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    const [rows] = await connection.execute(
      `SELECT id, tournament_id, round, bracket_slot
       FROM matches
       WHERE tournament_id IS NOT NULL
         AND status IN ('pending', 'active')
         AND (player1_id = ? OR player2_id = ?)
       ORDER BY round DESC, id DESC LIMIT 1`,
      [userId, userId]
    );
    const r = (Array.isArray(rows) && Array.isArray(rows[0])) ? rows[0] : rows;
    if (!r || r.length === 0) return null;
    return {
      id: r[0].id,
      tournamentId: r[0].tournament_id,
      round: r[0].round,
      bracketSlot: r[0].bracket_slot
    };
  } finally {
    if (shouldRelease) connection.release();
  }
}

/**
 * Chiamato da GameRoom.endGame() per i match di torneo. Marca il perdente
 * come eliminato, e se entrambi i match della coppia di slot del round
 * corrente sono completati, crea il match del round successivo coi due
 * vincitori. Se era la finale, marca il torneo completato e applica il
 * bonus +30 punti al campione.
 *
 * `conn` è una connessione transazionale già aperta da endGame, dentro la
 * stessa transazione che completa il match e salva gli score normali.
 */
export async function advanceTournamentAfterMatch(matchId, winnerId, loserId, conn) {
  // Recupera info match torneo
  const [mRows] = await conn.execute(
    `SELECT tournament_id, round, bracket_slot FROM matches WHERE id = ?`,
    [matchId]
  );
  const mArr = (Array.isArray(mRows) && Array.isArray(mRows[0])) ? mRows[0] : mRows;
  if (!mArr || mArr.length === 0) return { isTournament: false };
  const { tournament_id: tournamentId, round, bracket_slot: slot } = mArr[0];
  if (!tournamentId) return { isTournament: false };

  // Marca il perdente come eliminato in questo round
  await conn.execute(
    `UPDATE tournament_participants SET eliminated_at = ?
     WHERE tournament_id = ? AND user_id = ?`,
    [round, tournamentId, loserId]
  );

  // Recupera size del torneo per sapere se è la finale
  const [tRows] = await conn.execute(
    `SELECT size FROM tournaments WHERE id = ?`,
    [tournamentId]
  );
  const tArr = (Array.isArray(tRows) && Array.isArray(tRows[0])) ? tRows[0] : tRows;
  if (!tArr || tArr.length === 0) return { isTournament: false };
  const size = Number(tArr[0].size);
  const totalRounds = Math.log2(size);

  // È la finale?
  if (round >= totalRounds) {
    await conn.execute(
      `UPDATE tournaments SET status = 'completed', winner_id = ?, completed_at = NOW() WHERE id = ?`,
      [winnerId, tournamentId]
    );
    // Bonus +30 punti al vincitore del torneo, legato al match della finale
    const [scoreRows] = await conn.execute(
      `SELECT COALESCE(SUM(score_change), 0) AS total FROM scores WHERE player_id = ?`,
      [winnerId]
    );
    const sArr = (Array.isArray(scoreRows) && Array.isArray(scoreRows[0])) ? scoreRows[0] : scoreRows;
    const prevTotal = Number(sArr[0].total);
    await conn.execute(
      `INSERT INTO scores (match_id, player_id, score, score_change) VALUES (?, ?, ?, ?)`,
      [matchId, winnerId, prevTotal + TOURNAMENT_WIN_BONUS, TOURNAMENT_WIN_BONUS]
    );
    return { isTournament: true, finished: true, winnerId };
  }

  // Round intermedio: il vincitore avanza. Controlliamo l'altro match
  // della coppia per vedere se possiamo già creare il match successivo.
  // Pairing: due match di round R con slot k e k+1 (k pari) si uniscono
  // nel match di round R+1 con slot k/2.
  const pairSlot = (slot % 2 === 0) ? slot + 1 : slot - 1;
  const [pairRows] = await conn.execute(
    `SELECT id, status, winner_id FROM matches
     WHERE tournament_id = ? AND round = ? AND bracket_slot = ?`,
    [tournamentId, round, pairSlot]
  );
  const pArr = (Array.isArray(pairRows) && Array.isArray(pairRows[0])) ? pairRows[0] : pairRows;
  if (!pArr || pArr.length === 0) return { isTournament: true, finished: false };

  const pair = pArr[0];
  if (pair.status !== 'completed' || !pair.winner_id) {
    // L'altro match non è ancora finito: il vincitore aspetta.
    return { isTournament: true, finished: false, waiting: true };
  }

  // Entrambi finiti: crea il match del round successivo coi due vincitori.
  const nextRound = round + 1;
  const nextSlot  = Math.floor(slot / 2);
  // L'ordine player1/player2 segue lo slot più basso del round precedente
  const [winnerLow, winnerHigh] = (slot < pairSlot)
    ? [winnerId, pair.winner_id]
    : [pair.winner_id, winnerId];

  // Idempotenza: se per qualche motivo il match successivo esiste già, non duplicare.
  const [existRows] = await conn.execute(
    `SELECT id FROM matches WHERE tournament_id = ? AND round = ? AND bracket_slot = ?`,
    [tournamentId, nextRound, nextSlot]
  );
  const eArr = (Array.isArray(existRows) && Array.isArray(existRows[0])) ? existRows[0] : existRows;
  if (eArr && eArr.length > 0) {
    return { isTournament: true, finished: false, nextMatchId: eArr[0].id };
  }

  const [insertRes] = await conn.execute(
    `INSERT INTO matches (player1_id, player2_id, status, tournament_id, round, bracket_slot)
     VALUES (?, ?, 'pending', ?, ?, ?)`,
    [winnerLow, winnerHigh, tournamentId, nextRound, nextSlot]
  );

  return { isTournament: true, finished: false, nextMatchId: Number(insertRes.insertId) };
}

export { TOURNAMENT_WIN_BONUS };
