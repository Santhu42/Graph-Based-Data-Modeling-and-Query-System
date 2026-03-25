'use strict';

const graphService = require('../services/graphService');

/**
 * GET /graph?nodeId=:id&nodeType=:type&depth=:n
 *
 * BFS expansion from any node.
 * nodeType is optional – the service will auto-detect it.
 * depth defaults to 1, capped at 5.
 */
async function getGraph(req, res, next) {
  try {
    const { nodeId, nodeType, depth } = req.query;

    if (!nodeId) {
      const overview = await graphService.getOverview();
      return res.json(overview);
    }

    const parsedDepth = Math.min(parseInt(depth, 10) || 1, 5);
    const graph = await graphService.buildGraph(nodeId, nodeType || null, parsedDepth);

    if (!graph) {
      return res.status(404).json({ error: `No node found with id "${nodeId}".` });
    }

    return res.json(graph);
  } catch (err) {
    next(err);
  }
}

module.exports = { getGraph };

