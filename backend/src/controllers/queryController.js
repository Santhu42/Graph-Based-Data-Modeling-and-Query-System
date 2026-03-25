'use strict';

const queryService = require('../services/queryService');

/**
 * POST /query
 * Body: { "q": "Show all orders…", "history": [{role: 'user', text: '…'}] }
 */
async function runQuery(req, res, next) {
  try {
    const { q, history } = req.body;

    if (!q || typeof q !== 'string' || q.trim() === '') {
      return res.status(400).json({ error: '`q` field with a non-empty string is required.' });
    }

    const result = await queryService.processNaturalLanguageQuery(q.trim(), history || []);

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { runQuery };
