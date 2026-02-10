// Simple migration runner for Quorum Dashboard
// Run with: npx tsx scripts/migrate.ts

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const pool = new Pool({
  host: process.env.QUORUM_DB_HOST ?? 'localhost',
  port: parseInt(process.env.QUORUM_DB_PORT ?? '5432', 10),
  database: process.env.QUORUM_DB_NAME ?? 'quorum',
  user: process.env.QUORUM_DB_USER ?? 'quorum',
  password: process.env.QUORUM_DB_PASSWORD ?? '',
});

async function runMigration(fileName: string) {
  const migrationPath = join(process.cwd(), 'migrations', fileName);
  const sql = readFileSync(migrationPath, 'utf-8');

  console.log(`Running migration: ${fileName}`);
  try {
    await pool.query(sql);
    console.log(`Migration ${fileName} completed successfully`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Migration ${fileName} failed:`, error.message);
    }
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const migrationFile = args[0];

  if (!migrationFile) {
    console.log('Usage: npx tsx scripts/migrate.ts <migration-file.sql>');
    console.log('');
    console.log('Available migrations:');
    console.log('  - add_observations_table.sql');
    console.log('  - add_ai_providers.sql');
    console.log('  - add_settings_table.sql');
    process.exit(1);
  }

  try {
    await runMigration(migrationFile);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
