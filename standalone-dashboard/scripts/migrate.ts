#!/usr/bin/env tsx

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const pool = new Pool({
  host: process.env.QUORUM_DB_HOST ?? '192.168.20.150',
  port: parseInt(process.env.QUORUM_DB_PORT ?? '5432', 10),
  database: process.env.QUORUM_DB_NAME ?? 'quorum',
  user: process.env.QUORUM_DB_USER ?? 'quorum',
  password: process.env.QUORUM_DB_PASSWORD ?? '',
});

async function runMigration() {
  const migrationFile = join(process.cwd(), 'migrations', 'add_observations_table.sql');
  const sql = readFileSync(migrationFile, 'utf-8');

  console.log('Running migration: add_observations_table.sql');

  try {
    await pool.query(sql);
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
