'use strict';

const { Router } = require('express');
const nodeController = require('../controllers/nodeController');

const router = Router();

/**
 * GET /node/:id            – auto-detect entity type, return full details
 * GET /node/:id?type=:type – scope search to a specific entity type
 */
router.get('/:id', nodeController.getNode);

module.exports = router;
