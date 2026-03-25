'use strict';

// ─── Dangerous statement patterns ─────────────────────────────────────────────
// These are matched against the FULL cleaned SQL (case-insensitive, word-boundary).
const BLOCKED_PATTERNS = [
  /\bDROP\b/i,
  /\bDELETE\b/i,
  /\bTRUNCATE\b/i,
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bREPLACE\b/i,
  /\bMERGE\b/i,
  /\bEXECUTE\b/i,
  /\bEXEC\b/i,
  /\bCALL\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bCOPY\b/i,
  /\bVACUUM\b/i,
  /\bANALYZE\b/i,
  /\bREINDEX\b/i,
  /\bCLUSTER\b/i,
  /\bCOMMENT\b/i,
  /\bSECURITY\b/i,
  /--/,           // SQL line comments (injection vector)
  /\/\*/,         // block comment open
  /;\s*\S/,       // stacked statements (semicolon followed by more SQL)
];

// Characters / sequences that suggest prompt-injection or escape attempts
const INJECTION_PATTERNS = [
  /xp_/i,               // SQL Server procs
  /information_schema/i,// schema snooping (optional – remove if you need it)
  /pg_/i,               // PostgreSQL system objects
  /INTO\s+OUTFILE/i,    // MySQL file write
  /LOAD\s+DATA/i,
];

/**
 * Validate and sanitise an LLM-generated SQL string.
 *
 * @param {string} sql - Raw SQL returned by the LLM.
 * @returns {{ safe: boolean, sql: string, reason?: string }}
 */
function validateSql(sql) {
  if (!sql || typeof sql !== 'string') {
    return { safe: false, reason: 'Empty or non-string SQL.' };
  }

  // ── 1. Strip leading/trailing whitespace & ensure single statement ────────
  const cleaned = sql.trim().replace(/;+\s*$/, ''); // remove trailing semicolons

  // ── 2. Must start with SELECT ─────────────────────────────────────────────
  if (!/^SELECT\b/i.test(cleaned)) {
    return {
      safe: false,
      reason: `Only SELECT queries are allowed. Got: "${cleaned.slice(0, 40)}…"`,
    };
  }

  // ── 3. Block destructive keywords ─────────────────────────────────────────
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cleaned)) {
      return {
        safe: false,
        reason: `Blocked pattern detected: ${pattern.toString()}`,
      };
    }
  }

  // ── 4. Block injection patterns ───────────────────────────────────────────
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) {
      return {
        safe: false,
        reason: `Disallowed pattern detected: ${pattern.toString()}`,
      };
    }
  }

  // ── 5. Enforce a LIMIT so runaway queries can't dump the entire DB ────────
  const withLimit = /\bLIMIT\b/i.test(cleaned)
    ? cleaned
    : `${cleaned} LIMIT 200`;

  return { safe: true, sql: withLimit };
}

module.exports = { validateSql };
