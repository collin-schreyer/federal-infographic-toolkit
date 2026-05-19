import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

// On Fly.io we mount a persistent volume at /data. Locally, default to
// ./data inside the server directory. Both end up with app.db + uploads/
// living next to each other.
const DB_PATH = process.env.DB_PATH || './data/app.db';
export const DATA_DIR = process.env.DATA_DIR || './data';
export const UPLOADS_DIR = `${DATA_DIR}/uploads`;

mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    created_by TEXT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS renders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    variation TEXT NOT NULL,
    engine TEXT NOT NULL,
    visual_rhetoric TEXT,
    settings_json TEXT NOT NULL,
    source_name TEXT,
    image_path TEXT NOT NULL,
    thumbnail_path TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_renders_user_created ON renders(user_id, created_at DESC);
`);

export type DbUser = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  role: 'admin' | 'user';
  must_change_password: number;
  created_at: number;
  created_by: string | null;
};

export type PublicUser = Omit<DbUser, 'password_hash'>;

export const toPublicUser = (u: DbUser): PublicUser => {
  const { password_hash, ...rest } = u;
  return rest;
};

// Seed the initial admin on first boot. Email is fixed in production via env;
// the password is either taken from ADMIN_PASSWORD or auto-generated and printed
// to the server log so the operator can capture it from `fly logs` on first deploy.
export async function seedAdminIfMissing() {
  const email = process.env.ADMIN_EMAIL || 'schreyerc@bna-inc.com';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
  if (existing) return;

  const password = process.env.ADMIN_PASSWORD || `init-${randomBytes(8).toString('hex')}`;
  const password_hash = await bcrypt.hash(password, 10);
  const id = randomBytes(16).toString('hex');

  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, role, must_change_password, created_at, created_by)
    VALUES (?, ?, ?, ?, 'admin', ?, ?, NULL)
  `).run(id, email, 'Collin Schreyer', password_hash, process.env.ADMIN_PASSWORD ? 0 : 1, Date.now());

  console.log(`\n[seed] Created initial admin user`);
  console.log(`[seed]   email:    ${email}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`[seed]   password: ${password}`);
    console.log(`[seed]   (auto-generated; set ADMIN_PASSWORD env var to pin a value)`);
  } else {
    console.log(`[seed]   password: (from ADMIN_PASSWORD env)`);
  }
  console.log('');
}
