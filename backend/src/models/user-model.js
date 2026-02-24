import pool from '../utils/db.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// ==========================================
// 1. RICERCA UTENTE (Indistruttibile)
// ==========================================
export async function findByUsername(username) {
  const conn = await pool.getConnection();
  try {
    const result = await conn.execute(
      'SELECT id, username, password_hash as passwordHash, created_at as createdAt FROM users WHERE username = ?',
      [username]
    );
    
    // Normalizza i risultati per compatibilità tra mysql2 e mariadb
    const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;
    
    // Ritorna un VERO null se non ci sono utenti
    if (!rows || rows.length === 0) return null;
    
    return rows[0];
  } finally {
    conn.release();
  }
}

// ==========================================
// 2. CREAZIONE UTENTE
// ==========================================
export async function createUser(username, password) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );
    
    return {
      id: Number(result.insertId),
      username,
      createdAt: new Date().toISOString()
    };
  } finally {
    conn.release();
  }
}

// ==========================================
// 3. RICERCA PER ID
// ==========================================
export async function findById(userId) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      'SELECT id, username, created_at as createdAt FROM users WHERE id = ?',
      [userId]
    );
    
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } finally {
    conn.release();
  }
}

// ==========================================
// 4. VERIFICA PASSWORD
// ==========================================
export async function verifyPassword(plainPassword, passwordHash) {
  return await bcrypt.compare(plainPassword, passwordHash);
}