/**
 * load_data.js
 * Dynamically loads JSON files from entity folders into PostgreSQL.
 * Each folder → one table. Each JSON file → batch-inserted records.
 *
 * Usage:  node load_data.js
 * Config: set DB_* env vars or edit the DB_CONFIG block below.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ─── Configuration ────────────────────────────────────────────────────────────

/** Root directory that contains the entity sub-folders */
const DATA_ROOT = process.env.DATA_ROOT || path.join(__dirname, 'data');

/** Insert chunk size – tweak for performance vs memory */
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 500;

const DB_CONFIG = {
  host:     'localhost',
  port:     5432,
  database: 'fde_db',
  user:     'postgres',
  password: 'admin123',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map a JavaScript value to a PostgreSQL column type.
 * Intentionally conservative: unknown → TEXT.
 */
function inferPgType(value) {
  if (value === null || value === undefined) return 'TEXT';
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'BIGINT' : 'DOUBLE PRECISION';
  }
  if (typeof value === 'object') return 'JSONB';

  // String heuristics
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2})?/.test(s)) return 'TIMESTAMPTZ';
  return 'TEXT';
}

/** Quote a PostgreSQL identifier safely */
function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Collect every unique key across all records and determine the best PG type.
 * Prefers a more specific type – if any record has a non-null value for a key
 * that resolves to something other than TEXT, that type wins.
 */
function buildSchema(records) {
  const typeMap = {};

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const pgType = inferPgType(value);
      if (!typeMap[key] || typeMap[key] === 'TEXT') {
        typeMap[key] = pgType;
      }
    }
  }

  return typeMap; // { columnName: 'PG_TYPE', … }
}

/**
 * Generate a CREATE TABLE … IF NOT EXISTS statement.
 */
function buildCreateTable(tableName, typeMap) {
  const cols = Object.entries(typeMap)
    .map(([col, type]) => `  ${quoteIdent(col)} ${type}`)
    .join(',\n');

  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (\n${cols}\n);`;
}

/**
 * Insert records in batches using a single multi-row INSERT per batch.
 * Returns total rows inserted.
 */
async function batchInsert(pool, tableName, typeMap, records) {
  if (records.length === 0) return 0;

  const columns  = Object.keys(typeMap);
  const quotedCols = columns.map(quoteIdent).join(', ');
  let inserted = 0;

  for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
    const chunk = records.slice(offset, offset + BATCH_SIZE);
    const values   = [];
    const placeholders = chunk.map((record, rowIdx) => {
      const rowPlaceholders = columns.map((col, colIdx) => {
        const val = record[col] ?? null;
        // Stringify objects for JSONB columns
        values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
        return `$${rowIdx * columns.length + colIdx + 1}`;
      });
      return `(${rowPlaceholders.join(', ')})`;
    });

    const sql = `INSERT INTO ${quoteIdent(tableName)} (${quotedCols}) VALUES ${placeholders.join(', ')};`;
    await pool.query(sql, values);
    inserted += chunk.length;
  }

  return inserted;
}

// ─── Core Pipeline ────────────────────────────────────────────────────────────

async function loadFolder(pool, folderPath, tableName) {
  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.jsonl'));

  if (files.length === 0) {
    console.log(`  ⚠  No JSONL files found in "${tableName}", skipping.`);
    return;
  }

  // 1. Read every file and collect all records
  let allRecords = [];
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const records = [];
    let skipped = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // blank line
      try {
        records.push(JSON.parse(line));
      } catch (e) {
        skipped++;
        console.warn(`    ⚠  Skipping malformed line ${i + 1} in "${file}": ${e.message}`);
      }
    }
    allRecords = allRecords.concat(records);
    const skipNote = skipped ? ` (${skipped} lines skipped)` : '';
    console.log(`    ✔ Read ${records.length.toLocaleString()} records from "${file}"${skipNote}`);
  }

  if (allRecords.length === 0) {
    console.log(`  ⚠  No records found in "${tableName}", skipping.`);
    return;
  }

  // 2. Infer schema from all records
  const typeMap = buildSchema(allRecords);
  const createSQL = buildCreateTable(tableName, typeMap);

  // 3. Create table
  await pool.query(createSQL);
  console.log(`  ✔ Table "${tableName}" ensured (${Object.keys(typeMap).length} columns).`);

  // 4. Batch insert
  const inserted = await batchInsert(pool, tableName, typeMap, allRecords);
  console.log(`  ✔ Inserted ${inserted.toLocaleString()} rows into "${tableName}".`);
}

async function main() {
  console.log('========================================');
  console.log('   FDE – JSON → PostgreSQL Loader       ');
  console.log('========================================\n');

  // Validate data root exists
  if (!fs.existsSync(DATA_ROOT)) {
    console.error(`ERROR: DATA_ROOT not found: ${DATA_ROOT}`);
    console.error('Create a "data/" directory next to this script and place entity folders inside it.');
    process.exit(1);
  }

  // Connect
  console.log(`Connecting to PostgreSQL at ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database} …`);
  const pool = new Pool(DB_CONFIG);
  await pool.query('SELECT 1'); // connectivity check
  console.log('Connection OK.\n');

  // Enumerate entity folders
  const entries = fs.readdirSync(DATA_ROOT, { withFileTypes: true });
  const folders = entries.filter(e => e.isDirectory());

  if (folders.length === 0) {
    console.warn('No entity folders found inside DATA_ROOT. Exiting.');
    await pool.end();
    return;
  }

  console.log(`Found ${folders.length} entity folder(s): ${folders.map(f => f.name).join(', ')}\n`);

  // Process each folder
  const startTime = Date.now();
  for (const folder of folders) {
    const folderPath = path.join(DATA_ROOT, folder.name);
    console.log(`Processing: ${folder.name}`);
    try {
      await loadFolder(pool, folderPath, folder.name);
    } catch (err) {
      console.error(`  ✘ Error processing "${folder.name}": ${err.message}`);
      // Continue with next folder rather than aborting entirely
    }
    console.log();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`========================================`);
  console.log(`All done in ${elapsed}s.`);
  console.log(`========================================`);

  await pool.end();
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
