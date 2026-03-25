'use strict';

// ─── DB Schema sent to the LLM ────────────────────────────────────────────────
// Keep this compact – only include tables and columns the LLM needs to know.
// Expand as you add more tables.
const DB_SCHEMA = `
TABLE business_partners (
  "businessPartner"         TEXT PRIMARY KEY,
  "businessPartnerFullName" TEXT,
  "customer"                TEXT
);

TABLE sales_order_headers (
  "salesOrder"                  TEXT PRIMARY KEY,
  "soldToParty"                 TEXT,  -- FK to business_partners
  "creationDate"                TIMESTAMPTZ,
  "totalNetAmount"              TEXT,
  "transactionCurrency"         TEXT,
  "overallDeliveryStatus"       TEXT
);

TABLE sales_order_items (
  "salesOrder"          TEXT,   -- FK to sales_order_headers
  "salesOrderItem"      TEXT,
  "material"            TEXT,
  "netAmount"           TEXT,
  "productionPlant"     TEXT
);

TABLE outbound_delivery_headers (
  "deliveryDocument"              TEXT PRIMARY KEY,
  "creationDate"                  TIMESTAMPTZ,
  "overallGoodsMovementStatus"    TEXT
);

TABLE outbound_delivery_items (
  "deliveryDocument"      TEXT,   -- FK to outbound_delivery_headers
  "deliveryDocumentItem"  TEXT,
  "plant"                 TEXT,
  "referenceSdDocument"   TEXT   -- FK to sales_order_headers."salesOrder"
);

TABLE billing_document_headers (
  "billingDocument"           TEXT PRIMARY KEY,
  "creationDate"              TIMESTAMPTZ,
  "totalNetAmount"            TEXT,
  "soldToParty"               TEXT,
  "accountingDocument"        TEXT   -- Refers to journal_entry_items
);

TABLE billing_document_items (
  "billingDocument"       TEXT,   -- FK to billing_document_headers
  "billingDocumentItem"   TEXT,
  "material"              TEXT,
  "netAmount"             TEXT,
  "referenceSdDocument"   TEXT   -- FK to sales_order_headers."salesOrder"
);

TABLE journal_entry_items_accounts_receivable (
  "companyCode"                  TEXT,
  "fiscalYear"                   TEXT,
  "accountingDocument"           TEXT,
  "accountingDocumentItem"       TEXT,
  "customer"                     TEXT,
  "postingDate"                  TIMESTAMPTZ,
  "amountInTransactionCurrency"  TEXT,
  "referenceDocument"            TEXT,  -- FK to billing_document_headers."billingDocument"
  PRIMARY KEY ("companyCode","fiscalYear","accountingDocument","accountingDocumentItem")
);

TABLE plants (
  "plant"       TEXT PRIMARY KEY,
  "plantName"   TEXT
);

TABLE product_descriptions (
  "product"             TEXT PRIMARY KEY,
  "productDescription"  TEXT
);
`.trim();

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Build the system + user prompt for the LLM.
 * The LLM is instructed to return ONLY raw SQL, nothing else.
 */
function buildPrompt(userQuestion, history = []) {
  const system = `You are a PostgreSQL SQL generator.
You will be given a database schema, recent chat history, and a user question.
Your ONLY output must be a single valid SQL SELECT statement — no explanations, no markdown, no code fences, no comments.

CRITICAL RULES:
1. Only SELECT is allowed. Never use INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, or any other DML/DDL.
2. ALL column names MUST be double-quoted exactly as shown in the schema, even when preceded by a table alias.
   CORRECT:   bp."businessPartnerFullName"
   CORRECT:   soh."salesOrder"
   WRONG:     bp.businessPartnerFullName
   WRONG:     soh.salesOrder
3. Table aliases are allowed, but every column reference must still be double-quoted.
4. Do NOT invent tables or columns not in the schema. If the question can't be answered, output exactly: UNSUPPORTED
5. Always include a LIMIT clause (use 200 if the user doesn't specify a limit).
6. Use JOINs to enrich results where helpful (e.g., join business_partners to get customer names).
7. Do NOT add WHERE filters unless the user explicitly provides a specific value to filter on. For "top N" or "most/least" questions, use only ORDER BY + LIMIT — never fabricate filter values.

EXAMPLE 1 — top-N customers ranking (no WHERE):
Question: Who are our top customers?
SQL:
SELECT bp."businessPartner", bp."businessPartnerFullName", COUNT(soh."salesOrder") AS "orderCount"
FROM business_partners bp
JOIN sales_order_headers soh ON soh."soldToParty" = bp."businessPartner"
GROUP BY bp."businessPartner", bp."businessPartnerFullName"
ORDER BY "orderCount" DESC
LIMIT 10

EXAMPLE 2 — aggregation per category (no WHERE):
Question: Which products appear in the most billing document items?
SQL:
SELECT bdi."material", COUNT(*) AS "billingCount"
FROM billing_document_items bdi
GROUP BY bdi."material"
ORDER BY "billingCount" DESC
LIMIT 200

EXAMPLE 3 — complex flow tracing:
Question: Trace the flow for billing document 90000101 from order to journal entries.
SQL:
SELECT soh."salesOrder", odh."deliveryDocument", bdh."billingDocument", jei."accountingDocument"
FROM sales_order_headers soh
JOIN outbound_delivery_items odi ON odi."referenceSdDocument" = soh."salesOrder"
JOIN outbound_delivery_headers odh ON odh."deliveryDocument" = odi."deliveryDocument"
JOIN billing_document_items bdi ON bdi."referenceSdDocument" = soh."salesOrder"
JOIN billing_document_headers bdh ON bdh."billingDocument" = bdi."billingDocument"
JOIN journal_entry_items_accounts_receivable jei ON jei."referenceDocument" = bdh."billingDocument"
WHERE bdh."billingDocument" = '90000101'
LIMIT 200;

EXAMPLE 4 — incomplete flows:
Question: Identify sales orders that are delivered but not yet billed.
SQL:
SELECT soh."salesOrder", soh."overallDeliveryStatus"
FROM sales_order_headers soh
JOIN outbound_delivery_items odi ON odi."referenceSdDocument" = soh."salesOrder"
LEFT JOIN billing_document_items bdi ON bdi."referenceSdDocument" = soh."salesOrder"
WHERE soh."overallDeliveryStatus" = 'C' AND bdi."billingDocument" IS NULL
LIMIT 200;`;

  let user = `SCHEMA:\n${DB_SCHEMA}\n\n`;
  if (history.length > 0) {
    user += `HISTORY:\n${history.map(h => `${h.role === 'user' ? 'USER' : 'AI'}: ${h.text}`).join('\n')}\n\n`;
  }
  user += `USER QUESTION: ${userQuestion}\n\nSQL:`;

  return { system, user };
}


// ─── SQL extraction & normalisation ──────────────────────────────────────────

/**
 * Fix missing double-quotes on column references.
 * LLMs often produce:  alias.columnName  instead of  alias."columnName"
 * This regex finds  word.word  patterns where the column is NOT already quoted
 * and wraps the right side in double-quotes.
 *
 * Skips:  alias."already_quoted"
 * Skips:  schema.table  references (we have no schema prefixes, so this is safe)
 * Transforms:  t1.material  →  t1."material"
 *              soh.salesOrder  →  soh."salesOrder"
 */
function fixColumnQuoting(sql) {
  // Match:  <word> DOT <word-not-already-double-quoted>
  // i.e.  alias.column  but NOT  alias."column"
  return sql.replace(
    /\b([A-Za-z_][A-Za-z0-9_]*)\.(?!")([A-Za-z_][A-Za-z0-9_]*)\b/g,
    (_, alias, col) => `${alias}."${col}"`,
  );
}

/**
 * Fix known LLM hallucinations — column / table names that the model
 * persistently generates even when the schema says otherwise.
 *
 * Rules applied (case-insensitive, anywhere in the SQL):
 *  • payment_items / "payment_items" → payments_accounts_receivable
 *  • FROM payments / JOIN payments    → payments_accounts_receivable
 *    (only the old standalone `payments` table, not the correct long name)
 *  • bdi."referenceDocument"         → bdi."referenceSdDocument"
 *    (billing_document_items join key)
 *  • bdh."netAmount"                 → bdh."totalNetAmount"
 *    (billing_document_headers — correct column is totalNetAmount)
 *  • pi."paymentId" / pi."amount"    → replaced via table rename above
 */
function fixKnownColumnMistakes(sql) {
  if (!sql) return sql;

  // 1. Replace standalone `payments` table with correct name
  //    Match:  FROM payments / JOIN payments  but NOT payments_accounts_receivable
  sql = sql.replace(
    /\b(FROM|JOIN)\s+payments\b(?!_accounts_receivable)/gi,
    '$1 payments_accounts_receivable',
  );

  // 2. Replace payment_items table (didn't exist)
  //    The replacement reuses payments_accounts_receivable since that's the
  //    actual cleared-payment/AR table with invoiceReference linking to billing
  sql = sql.replace(/\b"?payment_items"?\b/gi, 'payments_accounts_receivable');

  // 3. Fix billing_document_items join key:  ."referenceDocument" → ."referenceSdDocument"
  //    Only where the identifier is NOT already referenceSdDocument
  sql = sql.replace(
    /\."referenceDocument"(?!\s*\bSd\b)/g,
    '."referenceSdDocument"',
  );

  // 4. Fix billing_document_headers amount column:
  //    alias."netAmount" that comes from bdh (billing headers) — not items
  //    We look for bdh."netAmount" specifically
  sql = sql.replace(/\bbdh\."netAmount"/g, 'bdh."totalNetAmount"');

  // 5. Fix old payment alias references (p. from old payments table)
  //    p."totalAmount" → par."amountInTransactionCurrency"
  //    p."postingDate" → par."postingDate"
  //    p."status"      → remove (no status column in payments_accounts_receivable)
  sql = sql.replace(/\bp\."totalAmount"/g, 'par."amountInTransactionCurrency"');

  // 6. Fix old payment_items alias (pi.) → par.
  sql = sql.replace(/\bpi\./g, 'par.');

  // 7. Fix aggregation of TEXT columns (must cast INSIDE the function)
  //    LLM often produces: SUM(soh."totalNetAmount")::DECIMAL
  //    Should be:         SUM(soh."totalNetAmount"::DECIMAL)
  sql = sql.replace(
    /\b(SUM|AVG|MIN|MAX)\(([^)]+?)\)::(DECIMAL|NUMERIC|DOUBLE PRECISION)\b/gi,
    '$1($2::$3)',
  );

  // 8. Fix columns that ARE definitely TEXT but used in math without casts
  //    Match: SUM(alias."totalNetAmount") -> SUM(alias."totalNetAmount"::NUMERIC)
  //    Only if they don't already have a cast inside the SUM
  sql = sql.replace(
    /\b(SUM|AVG)\(([^):]+?)"(totalNetAmount|netAmount|amountInTransactionCurrency|amountInCompanyCodeCurrency)"\)/gi,
    '$1($2"$3"::NUMERIC)',
  );

  if (sql !== sql) {  // always false but keeps the linter happy
    console.log('[llmService] fixKnownColumnMistakes applied corrections');
  }

  return sql;
}

/**
 * Extract a clean SQL string from raw LLM output and normalise column quoting.
 * Handles cases where the LLM wraps output in ```sql … ``` fences anyway.
 */
function extractSql(rawOutput) {
  if (!rawOutput) return null;

  let sql;

  // Strip markdown code fences if present
  const fenceMatch = rawOutput.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  sql = fenceMatch ? fenceMatch[1].trim() : rawOutput.trim();

  // Auto-fix bare alias.column → alias."column"
  sql = fixColumnQuoting(sql);

  return sql;
}

/**
 * Strip hallucinated WHERE clauses from LLM-generated SQL.
 *
 * Groq/Llama frequently invents WHERE conditions with placeholder values
 * (e.g. WHERE bp."customer" = 'X') even when the user asked for a global
 * ranking with no filter. This function removes any WHERE clause whose
 * string-literal values do NOT appear in the original user question.
 *
 * Logic:
 *   1. Find the WHERE clause in the SQL (stops at GROUP BY / ORDER BY / LIMIT).
 *   2. Collect all single-quoted string literals inside it.
 *   3. If NONE of those literals appear in the user question, remove the
 *      entire WHERE clause (it's fabricated).
 *   4. Individual numeric comparisons (e.g. amount > 0) are left alone because
 *      they rarely need a user-supplied value.
 */
function sanitizeWhereClauses(sql, userQuestion) {
  if (!sql || !userQuestion) return sql;

  const userLower = userQuestion.toLowerCase();

  // Match WHERE <body> stopping before GROUP BY / ORDER BY / HAVING / LIMIT
  const whereRe = /(\bWHERE\b\s+)([\s\S]+?)(\b(?:GROUP BY|ORDER BY|HAVING|LIMIT)\b|$)/i;
  const match = sql.match(whereRe);
  if (!match) return sql;

  const whereBody = match[2];

  // Find all single-quoted string literals ('...')
  const literals = [...whereBody.matchAll(/'([^']*)'/g)].map(m => m[1]);
  if (literals.length === 0) return sql; // no string literals — keep WHERE

  // If every literal value is absent from the user question, the WHERE is hallucinated
  const anyInQuestion = literals.some(val => {
    const v = val.trim().toLowerCase();
    return v.length > 0 && userLower.includes(v);
  });

  if (anyInQuestion) return sql; // user actually asked for a specific value

  // Remove the entire WHERE clause
  const sanitized = sql.replace(whereRe, '$3');
  console.log('[llmService] Removed hallucinated WHERE clause:', whereBody.trim());
  return sanitized.trim();
}

// ─── LLM callers ─────────────────────────────────────────────────────────────

/**
 * Call Google Gemini API (gemini-1.5-flash — free tier).
 * Docs: https://ai.google.dev/api/generate-content
 */
async function callGemini(system, user) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment');

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature:     0,      // deterministic SQL
      maxOutputTokens: 512,
    },
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

/**
 * Call OpenRouter API (OpenAI-compatible).
 */
async function callOpenRouter(system, user) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set in environment');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
      'HTTP-Referer':  'http://localhost:3000',
      'X-Title':       'FDE Graph Explorer',
    },
    body: JSON.stringify({
      model:    'google/gemini-2.0-flash-001',
      messages: [
        { role: 'system',  content: system },
        { role: 'user',    content: user   },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || null;
}

/**
 * Call Groq API (llama-3.3-70b-versatile — free tier).
 */
async function callGroq(system, user) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set in environment');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       'llama-3.3-70b-versatile',
      temperature: 0,
      max_tokens:  1024,
      messages: [
        { role: 'system',  content: system },
        { role: 'user',    content: user   },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Translate a natural-language question into a SQL SELECT statement.
 * Tries Gemini first; falls back to Groq if Gemini key is absent.
 *
 * @param {string} userQuestion
 * @param {Array} history
 * @returns {Promise<string|null>} Raw SQL string, or null if unsupported/failed.
 */
async function generateSql(userQuestion, history = []) {
  const { system, user } = buildPrompt(userQuestion, history);

  let rawOutput;

  if (process.env.OPENROUTER_API_KEY) {
    rawOutput = await callOpenRouter(system, user);
  } else if (process.env.GEMINI_API_KEY) {
    rawOutput = await callGemini(system, user);
  } else if (process.env.GROQ_API_KEY) {
    rawOutput = await callGroq(system, user);
  } else {
    throw new Error(
      'No LLM API key configured. Set OPENROUTER_API_KEY, GEMINI_API_KEY or GROQ_API_KEY in your .env file.',
    );
  }

  let sql = extractSql(rawOutput);

  // LLM indicated the question can't be answered with this schema
  if (!sql || sql.toUpperCase().trim() === 'UNSUPPORTED') return null;

  // Fix known LLM hallucinations (wrong table/column names)
  sql = fixKnownColumnMistakes(sql);

  // Strip hallucinated WHERE clauses whose filter values weren't in the question
  sql = sanitizeWhereClauses(sql, userQuestion);

  return sql;
}

/**
 * Build the system + user prompt for translating JSON data into a human answer.
 */
function buildAnswerPrompt(userQuestion, data, history = []) {
  const system = `You are a helpful business data assistant.
Recent conversations are provided for context.
1. No hallucinations. If the data doesn't answer the question, say so.
2. If the data is empty (length 0), state that no results were found for the query.
3. For large datasets, provide a high-level summary (e.g., "I found 200 orders…") and mention 1-2 notable examples if relevant.
4. Be professional and concise (typically 1-3 sentences).
5. Use specific values for small data sets, but favor summaries for large ones.
6. Do NOT mention SQL, tables, or technical details.
7. Format currency/dates nicely.`;

  let user = '';
  if (history.length > 0) {
    user += `HISTORY:\n${history.map(h => `${h.role === 'user' ? 'USER' : 'AI'}: ${h.text}`).join('\n')}\n\n`;
  }

  // Optimize: Send only a sample of records if data is large to stay within context limits
  const truncationLimit = 15;
  const dataForAi = data.length > truncationLimit 
    ? data.slice(0, 10).concat([{ note: `... [TRUNCATED] ${data.length - 10} more records exist in the full result set.` }])
    : data;

  user += `USER QUESTION: ${userQuestion}\n\nDATABASE RESULT (JSON - Total Count: ${data.length}):\n${JSON.stringify(dataForAi, null, 2)}\n\nANSWER:`;

  return { system, user };
}

/**
 * Call the configured LLM to generate a human-readable answer from query results.
 */
async function generateAnswer(userQuestion, data, history = []) {
  const { system, user } = buildAnswerPrompt(userQuestion, data, history);

  let answer;
  if (process.env.OPENROUTER_API_KEY) {
    answer = await callOpenRouter(system, user);
  } else if (process.env.GEMINI_API_KEY) {
    answer = await callGemini(system, user);
  } else if (process.env.GROQ_API_KEY) {
    answer = await callGroq(system, user);
  } else {
    return 'Summary unavailable (no LLM key).';
  }

  return answer ? answer.trim() : 'Could not generate a summary.';
}

/**
 * Classify if a question is related to the business dataset.
 */
async function isDatasetQuery(userQuestion) {
  const tableNames = [
    'business_partners', 'sales_order_headers', 'sales_order_items',
    'outbound_delivery_headers', 'outbound_delivery_items',
    'billing_document_headers', 'billing_document_items',
    'payments_accounts_receivable', 'plants', 'product_descriptions'
  ].join(', ');

  const system = `You are a query classifier for a business database.
Determine if the question is related to the following dataset: ${tableNames}.

Dataset domain: Sales orders, customers, deliveries, billing/invoices, payments, plants, and product data.

CRITICAL RULES:
1. Respond ONLY with 'YES' if it's related to this data schema.
2. Respond ONLY with 'NO' if the question is unrelated (e.g., general knowledge like "Who is Einstein?", creative writing like "Write a poem", personal questions, greetings, or general business advice).
3. If the user mentions any person, place, or event not in the database schema above, it is 'NO'.`;

  const user = `QUESTION: ${userQuestion}\n\nIS DATASET RELATED (YES/NO)?`;

  let response;
  if (process.env.OPENROUTER_API_KEY) {
    response = await callOpenRouter(system, user);
  } else if (process.env.GEMINI_API_KEY) {
    response = await callGemini(system, user);
  } else if (process.env.GROQ_API_KEY) {
    response = await callGroq(system, user);
  } else {
    return true; // fallback to allowing if no key
  }

  const result = response ? response.trim().toUpperCase() : 'YES';
  return result.includes('YES');
}

module.exports = { generateSql, generateAnswer, isDatasetQuery, DB_SCHEMA };
