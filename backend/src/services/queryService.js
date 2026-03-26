'use strict';

const pool        = require('../db/pool');
const { generateSql, generateAnswer, isDatasetQuery } = require('./llmService');
const { validateSql }  = require('./sqlSafety');

// ─── Keyword-rule fallback (used when no LLM key is configured) ───────────────
// Kept intact for offline / free usage.  LLM path takes priority when a key exists.

const INTENT_RULES = [
  {
    match: ['order', 'customer'],
    buildSql(tokens) {
      const customerId = extractId(tokens);
      if (customerId) {
        return {
          description: `Sales orders for customer ${customerId}`,
          sql: `SELECT soh.*, bp."businessPartnerFullName" AS "customerName"
                FROM   sales_order_headers soh
                LEFT JOIN business_partners bp ON bp."businessPartner" = soh."soldToParty"
                WHERE  soh."soldToParty" = $1
                ORDER  BY soh."creationDate" DESC`,
          params: [customerId],
        };
      }
      return {
        description: 'All sales orders with customer names',
        sql: `SELECT soh.*, bp."businessPartnerFullName" AS "customerName"
              FROM   sales_order_headers soh
              LEFT JOIN business_partners bp ON bp."businessPartner" = soh."soldToParty"
              ORDER  BY soh."creationDate" DESC LIMIT 100`,
        params: [],
      };
    },
  },
  {
    match: ['deliver', 'order'],
    buildSql(tokens) {
      const orderId = extractId(tokens);
      if (orderId) {
        return {
          description: `Deliveries referencing sales order ${orderId}`,
          sql: `SELECT DISTINCT odh.*, p."plantName"
                FROM   outbound_delivery_items odi
                JOIN   outbound_delivery_headers odh ON odh."deliveryDocument" = odi."deliveryDocument"
                LEFT JOIN plants p ON p."plant" = odh."shippingPoint"
                WHERE  odi."referenceSdDocument" = $1`,
          params: [orderId],
        };
      }
      return {
        description: 'Recent deliveries',
        sql: `SELECT odh.*, p."plantName"
              FROM   outbound_delivery_headers odh
              LEFT JOIN plants p ON p."plant" = odh."shippingPoint"
              ORDER  BY odh."creationDate" DESC LIMIT 100`,
        params: [],
      };
    },
  },
  {
    match: ['deliver', 'plant'],
    buildSql(tokens) {
      const plantId = extractId(tokens);
      if (plantId) {
        return {
          description: `Deliveries at plant ${plantId}`,
          sql: `SELECT DISTINCT odh.*, p."plantName"
                FROM   outbound_delivery_items odi
                JOIN   outbound_delivery_headers odh ON odh."deliveryDocument" = odi."deliveryDocument"
                LEFT JOIN plants p ON p."plant" = odi."plant"
                WHERE  odi."plant" = $1`,
          params: [plantId],
        };
      }
      return {
        description: 'All plants with delivery counts',
        sql: `SELECT p."plant", p."plantName", COUNT(DISTINCT odi."deliveryDocument") AS deliveries
              FROM   plants p
              LEFT JOIN outbound_delivery_items odi ON odi."plant" = p."plant"
              GROUP  BY p."plant", p."plantName"
              ORDER  BY deliveries DESC LIMIT 50`,
        params: [],
      };
    },
  },
  {
    match: ['invoice', 'billing'],
    buildSql(tokens) {
      const id = extractId(tokens);
      if (id) {
        return {
          description: `Billing document ${id}`,
          sql: `SELECT * FROM billing_document_headers WHERE "billingDocument" = $1`,
          params: [id],
        };
      }
      return {
        description: 'Recent billing documents',
        sql: `SELECT * FROM billing_document_headers ORDER BY "creationDate" DESC LIMIT 100`,
        params: [],
      };
    },
  },
  {
    match: ['top', 'customer'],
    buildSql() {
      return {
        description: 'Top 10 customers by order volume',
        sql: `SELECT bp."businessPartner", bp."businessPartnerFullName", COUNT(soh."salesOrder") AS "orderCount"
              FROM business_partners bp
              JOIN sales_order_headers soh ON soh."soldToParty" = bp."businessPartner"
              GROUP BY bp."businessPartner", bp."businessPartnerFullName"
              ORDER BY "orderCount" DESC LIMIT 10`,
        params: [],
      };
    },
  },
  {
    match: ['high', 'order'],
    buildSql() {
      return {
        description: 'Highest value sales order',
        sql: `SELECT soh."salesOrder", soh."totalNetAmount", soh."transactionCurrency", soh."creationDate", bp."businessPartnerFullName"
              FROM sales_order_headers soh
              LEFT JOIN business_partners bp ON bp."businessPartner" = soh."soldToParty"
              ORDER BY (soh."totalNetAmount"::NUMERIC) DESC LIMIT 1`,
        params: [],
      };
    },
  },
  {
    match: ['customer'],
    buildSql(tokens) {
      const id = extractId(tokens);
      if (id) {
        return {
          description: `Customer ${id}`,
          sql: `SELECT * FROM business_partners WHERE "businessPartner" = $1 OR "customer" = $1`,
          params: [id],
        };
      }
      const nameToken = tokens.find(t => /[a-zA-Z]{3,}/.test(t) && t !== 'customer');
      if (nameToken) {
        return {
          description: `Customers matching "${nameToken}"`,
          sql: `SELECT * FROM business_partners WHERE LOWER("businessPartnerFullName") LIKE $1 LIMIT 50`,
          params: [`%${nameToken.toLowerCase()}%`],
        };
      }
      return {
        description: 'All customers',
        sql: `SELECT * FROM business_partners ORDER BY "businessPartnerFullName" LIMIT 100`,
        params: [],
      };
    },
  },
  {
    match: ['plant'],
    buildSql(tokens) {
      const id = extractId(tokens);
      if (id) {
        return {
          description: `Plant ${id}`,
          sql: `SELECT * FROM plants WHERE "plant" = $1`,
          params: [id],
        };
      }
      return {
        description: 'All plants',
        sql: `SELECT * FROM plants ORDER BY "plant" LIMIT 200`,
        params: [],
      };
    },
  },
  {
    match: ['material', 'product'],
    buildSql(tokens) {
      const id = extractId(tokens);
      if (id) {
        return {
          description: `Product ${id}`,
          sql: `SELECT * FROM product_descriptions WHERE "material" = $1`,
          params: [id],
        };
      }
      return {
        description: 'All products',
        sql: `SELECT * FROM product_descriptions LIMIT 100`,
        params: [],
      };
    },
  },
  {
    match: ['payment'],
    buildSql(tokens) {
      const id = extractId(tokens);
      if (id) {
        return {
          description: `Payments for customer ${id}`,
          sql: `SELECT * FROM payments_accounts_receivable WHERE "customer" = $1`,
          params: [id],
        };
      }
      return {
        description: 'Recent payments',
        sql: `SELECT * FROM payments_accounts_receivable ORDER BY "postingDate" DESC LIMIT 100`,
        params: [],
      };
    },
  },
  {
    match: ['all', 'order'],
    buildSql() {
      return {
        description: 'Latest sales orders',
        sql: `SELECT soh.*, bp."businessPartnerFullName" AS "customerName"
              FROM   sales_order_headers soh
              LEFT JOIN business_partners bp ON bp."businessPartner" = soh."soldToParty"
              ORDER  BY soh."creationDate" DESC LIMIT 100`,
        params: [],
      };
    },
  },
  {
    match: ['my', 'customer'],
    buildSql() {
      return {
        description: 'Recent business partners',
        sql: `SELECT * FROM business_partners ORDER BY "businessPartner" LIMIT 100`,
        params: [],
      };
    },
  },
];

function extractId(tokens) {
  // Most IDs in SAP are numeric (e.g., 310000108, 740506).
  // This avoids matching common words like 'highest' as IDs.
  return tokens.find(t => /^\d{3,}$/.test(t)) || null;
}

function tokenise(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
}

function ruleMatches(rule, tokens) {
  return rule.match.every(kw => tokens.some(t => t.startsWith(kw) || kw.startsWith(t)));
}

// ─── LLM path ────────────────────────────────────────────────────────────────

/**
 * Use the LLM to translate a question to SQL, validate it, then run it.
 * Returns null if no LLM key is configured (caller falls back to keyword rules).
 */
async function runWithLlm(rawQuery, history = []) {
  let sql;
  try {
    sql = await generateSql(rawQuery, history);
  } catch (err) {
    if (err.message.includes('No LLM API key')) throw err;
    console.warn('[queryService] LLM call failed, falling back to keyword rules:', err.message);
    return null;
  }

  if (!sql) {
    return {
      query:       rawQuery,
      interpreted: 'The LLM could not generate SQL for this question.',
      answer:      'I am not sure how to answer that based on the current data schema.',
      engine:      'llm',
      sql:         null,
      data:        [],
      rowCount:    0,
    };
  }

  // ── Safety check ──────────────────────────────────────────────────────────
  const safety = validateSql(sql);
  if (!safety.safe) {
    return {
      query:       rawQuery,
      interpreted: 'Query blocked by safety filters.',
      answer:      `I cannot execute this request. Reason: ${safety.reason}`,
      engine:      'llm',
      reason:      safety.reason,
      sql:         sql,
      data:        [],
      rowCount:    0,
    };
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  let rows;
  try {
    const result = await pool.query(safety.sql);
    rows = result.rows;
  } catch (dbErr) {
    console.error('[queryService] LLM SQL execution failed:', dbErr.message);
    console.error('[queryService] Offending SQL:', safety.sql);
    return {
      query:       rawQuery,
      interpreted: 'LLM generated SQL that failed to execute.',
      answer:      `The generated query encountered an error.`,
      engine:      'llm',
      error:       dbErr.message,
      sql:         safety.sql,
      data:        [],
      rowCount:    0,
    };
  }

  // ─── Generate human answer ─────────────────────────────────────────────
  let answer = 'No summary available.';
  try {
    answer = await generateAnswer(rawQuery, rows, history);
  } catch (err) {
    console.warn('[queryService] Failed to generate human answer:', err.message);
  }

  return {
    query:       rawQuery,
    interpreted: 'LLM-generated SQL executed successfully.',
    answer:      answer,
    engine:      'llm',
    sql:         safety.sql,
    data:        rows,
    rowCount:    rows.length,
  };
}

// ─── Keyword-rule path ────────────────────────────────────────────────────────

async function runWithKeywordRules(rawQuery, history = []) {
  const tokens = tokenise(rawQuery);
  const rule   = INTENT_RULES.find(r => ruleMatches(r, tokens));

  if (!rule) {
    return {
      query:       rawQuery,
      interpreted: 'No matching intent found.',
      answer:      'This system is designed to answer questions related to the provided dataset only. Try: "show all orders", "top customers", or "all plants".',
      engine:      'keyword-rules',
      hint:        'Try: "orders for customer 310000108", "deliveries for order 740506", "open orders", "all plants".',
      data:        [],
      rowCount:    0,
    };
  }

  const { sql, params, description } = rule.buildSql(tokens, rawQuery);
  const { rows } = await pool.query(sql, params);

  // ─── Generate human answer (if LLM key available) ──────────────────────
  let answer = description; // fallback to rule description
  const hasLlmKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY;
  if (hasLlmKey) {
    try {
      const aiAnswer = await generateAnswer(rawQuery, rows, history);
      if (aiAnswer && !aiAnswer.includes('unavailable')) {
         answer = aiAnswer;
      }
    } catch (err) {
      console.warn('[queryService] Failed to generate human answer (keyword path):', err.message);
    }
  }

  // ─── Formatted Fallback if AI fails (e.g. rate limit) ───────────────────
  if (answer === description && rows && rows.length > 0) {
    if (description.includes("Top 10 customers")) {
      const topNames = rows.slice(0, 3).map(r => r.businessPartnerFullName || r.businessPartner).filter(Boolean);
      if (topNames.length > 0) {
        answer = `Our top customers are ${topNames.join(', ')}${rows.length > 3 ? ' and others' : ''}, based on order volume.`;
      }
    } else if (description.includes("Highest value sales order")) {
      const r = rows[0];
      answer = `The highest value order is ${r.salesOrder} for ${r.totalNetAmount} ${r.transactionCurrency}, placed by ${r.businessPartnerFullName} on ${new Date(r.creationDate).toLocaleDateString()}.`;
    } else if (description.includes("All customers")) {
      answer = `I found ${rows.length} customers.`;
    }
  }

  // ─── Extract nodes to highlight ───────────────────────────────────────
  const highlightNodes = [];
  rows.forEach(row => {
    if (row.salesOrder) highlightNodes.push(`sales_order_headers::${row.salesOrder}`);
    if (row.businessPartner) highlightNodes.push(`business_partners::${row.businessPartner}`);
    if (row.customer) highlightNodes.push(`business_partners::${row.customer}`);
    if (row.deliveryDocument) highlightNodes.push(`outbound_delivery_headers::${row.deliveryDocument}`);
    if (row.billingDocument) highlightNodes.push(`billing_document_headers::${row.billingDocument}`);
  });

  return {
    query:       rawQuery,
    interpreted: description,
    answer:      answer,
    engine:      'keyword-rules',
    sql:         sql.replace(/\s+/g, ' ').trim(),
    data:        rows,
    rowCount:    rows.length,
    highlightNodes: [...new Set(highlightNodes)]
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Fast local check: returns true if the query is obviously off-topic.
 * Catches general knowledge, creative writing, personal questions, etc.
 * without burning an LLM API call.
 */
const OFF_TOPIC_PATTERNS = [
  // General knowledge about people
  /who\s+is\b/i,
  /what\s+is\s+(a|an|the)?\s*[a-z]+\s*\?/i,
  /tell\s+me\s+about/i,
  /explain\s+(me\s+)?(what|how|why)/i,
  // Creative / general tasks
  /write\s+(a|an|me)?\s*(poem|story|essay|email|letter|code|song|joke)/i,
  /generate\s+(a|an)?\s*(poem|story|essay|image|picture)/i,
  /translate\s+(this|the|to)/i,
  /summarize\s+this/i,
  // Off-domain topics
  /\b(weather|news|sports|stock|crypto|bitcoin|movie|film|music|recipe|food|health|medicine|doctor|covid|election|politic|history|science|math|physics|chemistry|capital\s+of|president\s+of|prime\s+minister)\b/i,
  // Personal / philosophical
  /what\s+(should|can|do)\s+i/i,
  /how\s+to\s+(lose|gain|improve|cook|make|bake|fix\s+my)/i,
  // Famous people not in dataset
  /\b(elon\s*musk|einstein|tesla|gandhi|trump|modi|obama|newton|darwin|shakespeare|napoleon|hitler|mahatma)\b/i,
];

function isObviouslyOffTopic(query) {
  return OFF_TOPIC_PATTERNS.some(re => re.test(query));
}

/**
 * Process a natural-language query.
 *
 * @param {string} rawQuery
 * @param {Array} history
 * @returns {Promise<object>}
 */
async function processNaturalLanguageQuery(rawQuery, history = []) {
  const hasLlmKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY;

  // ─── Fast local off-topic check (no LLM call needed) ─────────────────────
  if (isObviouslyOffTopic(rawQuery)) {
    return {
      query:    rawQuery,
      answer:   'This system is designed to answer questions related to the provided dataset only.',
      engine:   'local-classifier',
      data:     [],
      rowCount: 0,
    };
  }

  if (hasLlmKey) {
    // ─── LLM classification check ─────────────────────────────────────────
    try {
      const isRelated = await isDatasetQuery(rawQuery);
      if (!isRelated) {
        return {
          query:    rawQuery,
          answer:   'This system is designed to answer questions related to the provided dataset only.',
          engine:   'llm-classifier',
          data:     [],
          rowCount: 0,
        };
      }
    } catch (err) {
      console.warn('[queryService] Dataset classification failed:', err.message);
    }

    const result = await runWithLlm(rawQuery, history);
    if (result) return result;
    // LLM failed transiently — fall through to keyword rules
  }

  return runWithKeywordRules(rawQuery, history);
}

module.exports = { processNaturalLanguageQuery };
