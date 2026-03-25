'use strict';

const pool = require('../db/pool');

/**
 * Entity search registry.
 * Each entry describes how to look up a node by ID and what
 * related data to include in the response.
 */
const ENTITY_LOOKUPS = [
  {
    type:  'sales_order_headers',
    label: 'Sales Order',
    query: `
      SELECT
        soh.*,
        bp."businessPartnerFullName"   AS "customerName",
        bp."businessPartnerIsBlocked"  AS "customerBlocked"
      FROM sales_order_headers soh
      LEFT JOIN business_partners bp ON bp."businessPartner" = soh."soldToParty"
      WHERE soh."salesOrder" = $1
    `,
    itemsQuery: `
      SELECT * FROM sales_order_items WHERE "salesOrder" = $1
      ORDER BY "salesOrderItem"
    `,
  },
  {
    type:  'outbound_delivery_headers',
    label: 'Delivery',
    query: `
      SELECT
        odh.*,
        p."plantName" AS "shippingPointName"
      FROM outbound_delivery_headers odh
      LEFT JOIN plants p ON p."plant" = odh."shippingPoint"
      WHERE odh."deliveryDocument" = $1
    `,
    itemsQuery: `
      SELECT odi.*, p."plantName"
      FROM outbound_delivery_items odi
      LEFT JOIN plants p ON p."plant" = odi."plant"
      WHERE odi."deliveryDocument" = $1
      ORDER BY odi."deliveryDocumentItem"
    `,
  },
  {
    type:  'business_partners',
    label: 'Business Partner / Customer',
    query: `
      SELECT bp.*
      FROM business_partners bp
      WHERE bp."businessPartner" = $1
    `,
    itemsQuery: `
      SELECT soh."salesOrder", soh."creationDate", soh."totalNetAmount",
             soh."overallDeliveryStatus", soh."transactionCurrency"
      FROM sales_order_headers soh
      WHERE soh."soldToParty" = $1
      ORDER BY soh."creationDate" DESC
      LIMIT 20
    `,
  },
  {
    type:  'plants',
    label: 'Plant',
    query: `SELECT * FROM plants WHERE "plant" = $1`,
    itemsQuery: `
      SELECT DISTINCT odi."deliveryDocument", odh."creationDate",
             odh."overallGoodsMovementStatus"
      FROM outbound_delivery_items odi
      JOIN outbound_delivery_headers odh
           ON odh."deliveryDocument" = odi."deliveryDocument"
      WHERE odi."plant" = $1
      ORDER BY odh."creationDate" DESC
      LIMIT 20
    `,
  },
  {
    type:  'billing_document_headers',
    label: 'Billing Document',
    query: `SELECT * FROM billing_document_headers WHERE "billingDocument" = $1`,
    itemsQuery: `
      SELECT * FROM billing_document_items
      WHERE "billingDocument" = $1
      ORDER BY "billingDocumentItem"
    `,
  },
];

/**
 * Find a node by raw id, optionally restricting to a given type.
 * Returns { type, label, data, items } or null.
 */
async function findNode(rawId, typeHint) {
  const lookups = typeHint
    ? ENTITY_LOOKUPS.filter(e => e.type === typeHint)
    : ENTITY_LOOKUPS;

  for (const entity of lookups) {
    const { rows } = await pool.query(entity.query, [rawId]);
    if (!rows.length) continue;

    const record = rows[0];
    let items    = [];
    if (entity.itemsQuery) {
      const itemRes = await pool.query(entity.itemsQuery, [rawId]);
      items = itemRes.rows;
    }

    return {
      type:  entity.type,
      label: entity.label,
      data:  record,
      items,
    };
  }

  return null;
}

module.exports = { findNode };
