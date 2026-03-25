'use strict';

const nodeService = require('../services/nodeService');

/**
 * GET /node/:id
 */
async function getNode(req, res, next) {
  try {
    const { id }  = req.params;
    const { type } = req.query; // optional entity type hint

    const result = await nodeService.findNode(id, type || null);

    if (!result) {
      return res.status(404).json({ error: `Node with id "${id}" not found.` });
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getNode };
