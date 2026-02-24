import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationNumber = process.argv[2];

if (!migrationNumber) {
  console.error('Usage: node run-migration.js <migration_number>');
  console.error('Example: node run-migration.js 001');
  process.exit(1);
}

async function runMigration() {
  let conn;
  
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true
    });

    const files = fs.readdirSync(path.join(__dirname, '../../database/migrations'));
    const matchingFile = files.find(f => f.startsWith(`${migrationNumber}_`));
    
    if (!matchingFile) {
      throw new Error(`Migration file not found for number: ${migrationNumber}`);
    }

    const sqlPath = path.join(__dirname, '../../database/migrations', matchingFile);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`Running migration: ${matchingFile}`);
    
    await conn.query(sql);
    
    console.log(`✅ Migration completed successfully!`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (conn) {
      await conn.end();
    }
  }
}

runMigration();
