'use strict';

const { Router } = require('express');
const graphController = require('../controllers/graphController');

const router = Router();

/**
 * GET /graph?nodeId=:id&nodeType=:type&depth=:n
 *
 * BFS graph expansion from any node in the system.
 * nodeType is optional (auto-detected). depth defaults to 1, max 5.
 *
 * Response: { rootId, nodes: [{id, label, type, data}], edges: [{source, target, relation}] }
 */
router.get('/', graphController.getGraph);

module.exports = router;

