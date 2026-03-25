'use strict';

const { Router } = require('express');
const queryController = require('../controllers/queryController');

const router = Router();

/**
 * POST /query
 * Body: { "q": "Show all orders for customer 310000108" }
 *
 * Parses a natural-language query and returns matching rows.
 */
router.post('/', queryController.runQuery);

module.exports = router;
