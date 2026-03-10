import pool from '../utils/db.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { findByUsername } from './user-model.js';

export async function findUserByUsername(username) {
  return await findByUsername(username);
}

export async function expireOldInvitations(conn = null) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    await connection.execute(
      `UPDATE invitations
       SET status = 'expired'
       WHERE status = 'pending'
       AND expires_at < NOW()`
    );
  } finally {
    if (shouldRelease) connection.release();
  }
}

export async function createInvitation(inviterId, inviteeId) {
  const conn = await pool.getConnection();
  try {
    const [existing] = await conn.execute(
      `SELECT id FROM invitations
       WHERE status = 'pending'
       AND expires_at > NOW()
       AND ((inviter_id = ? AND invitee_id = ?)
            OR (inviter_id = ? AND invitee_id = ?))`,
      [inviterId, inviteeId, inviteeId, inviterId]
    );
    
    // Normalizza per compatibilità driver
    const rows = (Array.isArray(existing) && Array.isArray(existing[0])) ? existing[0] : existing;

    if (rows && rows.length > 0) {
      throw new ConflictError('A pending invitation already exists between these users');
    }

    const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // Scade in 3 minuti

    const [result] = await conn.execute(
      'INSERT INTO invitations (inviter_id, invitee_id, status, expires_at) VALUES (?, ?, "pending", ?)',
      [inviterId, inviteeId, expiresAt]
    );
    
    return {
      id: Number(result.insertId),
      inviterId,
      inviteeId,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString()
    };
  } finally {
    conn.release();
  }
}

export async function findActiveInvitationsByInvitee(inviteeId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    try {
      await expireOldInvitations(conn);
      const [result] = await conn.execute(
        `SELECT i.id, i.inviter_id, i.invitee_id, i.status, i.created_at, i.expires_at, u.username as inviter_username
         FROM invitations i
         JOIN users u ON i.inviter_id = u.id
         WHERE i.invitee_id = ? AND i.status = 'pending' AND i.expires_at > NOW()
         ORDER BY i.created_at DESC`,
        [inviteeId]
      );
      
      const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;
      await conn.commit();
      
      return (rows || []).map(row => ({
        id: row.id,
        inviterId: row.inviter_id,
        inviteeId: row.invitee_id,
        inviterUsername: row.inviter_username,
        status: row.status,
        expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
        // FIX APPLICATO QUI
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
      }));
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  } finally {
    conn.release();
  }
}

export async function findInvitationById(id, conn = null) {
  const connection = conn || await pool.getConnection();
  const shouldRelease = !conn;
  try {
    const [result] = await connection.execute('SELECT * FROM invitations WHERE id = ?', [id]);
    const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;
    
    if (!rows || rows.length === 0) return null;
    
    const row = rows[0];
    return {
      id: row.id,
      inviterId: row.inviter_id,
      inviteeId: row.invitee_id,
      status: row.status,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
    };
  } finally {
    if (shouldRelease) connection.release();
  }
}

export async function acceptInvitation(invitationId, inviteeId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    try {
      await expireOldInvitations(conn);
      const invitation = await findInvitationById(invitationId, conn);
      
      if (!invitation) throw new NotFoundError('Invitation not found');
      if (invitation.inviteeId !== inviteeId) throw new ValidationError('You are not the recipient of this invitation');
      if (invitation.status !== 'pending') throw new ValidationError(`Invitation is no longer pending`);
      if (new Date(invitation.expiresAt) < new Date()) throw new ValidationError('Invitation has expired');

      // Update status
      await conn.execute('UPDATE invitations SET status = "accepted" WHERE id = ?', [invitationId]);
      
      // Crea la partita
      const [matchResult] = await conn.execute(
        'INSERT INTO matches (player1_id, player2_id, status) VALUES (?, ?, "pending")',
        [invitation.inviterId, invitation.inviteeId]
      );
      
      await conn.commit();
      
      return {
        id: Number(matchResult.insertId),
        player1Id: invitation.inviterId,
        player2Id: invitation.inviteeId,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  } finally {
    conn.release();
  }
}