'use strict';

const pool = require('../db/pool');

const ENTITIES = {
  business_partners: {
    table:   'business_partners',
    pk:      ['businessPartner'],
    label:   'Customer',
    labelFn: (row) => row.businessPartnerFullName || row.businessPartner,
    relations: [
      {
        targetType: 'sales_order_headers',
        relation:   'placedOrder',
        localKeys:  ['businessPartner'],
        remoteKeys: ['soldToParty'],
      },
    ],
  },

  sales_order_headers: {
    table:   'sales_order_headers',
    pk:      ['salesOrder'],
    label:   'Order',
    labelFn: (row) => `Order #${row.salesOrder}`,
    relations: [
      {
        targetType: 'business_partners',
        relation:   'soldTo',
        localKeys:  ['soldToParty'],
        remoteKeys: ['businessPartner'],
      },
      {
        targetType: 'sales_order_items',
        relation:   'hasItem',
        localKeys:  ['salesOrder'],
        remoteKeys: ['salesOrder'],
      },
    ],
  },

  sales_order_items: {
    table:   'sales_order_items',
    pk:      ['salesOrder', 'salesOrderItem'],
    label:   'Order Item',
    labelFn: (row) => `Order ${row.salesOrder} / Item ${row.salesOrderItem}`,
    relations: [
      {
        targetType: 'sales_order_headers',
        relation:   'belongsTo',
        localKeys:  ['salesOrder'],
        remoteKeys: ['salesOrder'],
      },
      {
        targetType: 'plants',
        relation:   'productionPlant',
        localKeys:  ['productionPlant'],
        remoteKeys: ['plant'],
      },
      {
        targetType: 'product_descriptions',
        relation:   'productInfo',
        localKeys:  ['material'],
        remoteKeys: ['product'],
      }
    ],
  },

  outbound_delivery_headers: {
    table:   'outbound_delivery_headers',
    pk:      ['deliveryDocument'],
    label:   'Delivery',
    labelFn: (row) => `Delivery #${row.deliveryDocument}`,
    relations: [
      {
        targetType: 'outbound_delivery_items',
        relation:   'hasItem',
        localKeys:  ['deliveryDocument'],
        remoteKeys: ['deliveryDocument'],
      },
      {
        targetType: 'plants',
        relation:   'shippingPoint',
        localKeys:  ['shippingPoint'],
        remoteKeys: ['plant'],
      },
      {
        targetType: 'business_partners',
        relation:   'shipTo',
        localKeys:  ['shipToParty'],
        remoteKeys: ['businessPartner'],
      }
    ],
  },

  outbound_delivery_items: {
    table:   'outbound_delivery_items',
    pk:      ['deliveryDocument', 'deliveryDocumentItem'],
    label:   'Delivery Item',
    labelFn: (row) => `Delivery ${row.deliveryDocument} / Item ${row.deliveryDocumentItem}`,
    relations: [
      {
        targetType: 'outbound_delivery_headers',
        relation:   'belongsTo',
        localKeys:  ['deliveryDocument'],
        remoteKeys: ['deliveryDocument'],
      },
      {
        targetType: 'sales_order_headers',
        relation:   'referencedOrder',
        localKeys:  ['referenceSdDocument'],
        remoteKeys: ['salesOrder'],
      },
      {
        targetType: 'plants',
        relation:   'plant',
        localKeys:  ['plant'],
        remoteKeys: ['plant'],
      },
      {
        targetType: 'product_descriptions',
        relation:   'productInfo',
        localKeys:  ['material'],
        remoteKeys: ['product'],
      }
    ],
  },

  billing_document_headers: {
    table:   'billing_document_headers',
    pk:      ['billingDocument'],
    label:   'Invoice',
    labelFn: (row) => `Invoice #${row.billingDocument}`,
    relations: [
      {
        targetType: 'billing_document_items',
        relation:   'hasItem',
        localKeys:  ['billingDocument'],
        remoteKeys: ['billingDocument'],
      },
      {
        targetType: 'business_partners',
        relation:   'billTo',
        localKeys:  ['payerParty'],
        remoteKeys: ['businessPartner'],
      }
    ],
  },

  billing_document_items: {
    table:   'billing_document_items',
    pk:      ['billingDocument', 'billingDocumentItem'],
    label:   'Invoice Item',
    labelFn: (row) => `Invoice ${row.billingDocument} / Item ${row.billingDocumentItem}`,
    relations: [
      {
        targetType: 'billing_document_headers',
        relation:   'belongsTo',
        localKeys:  ['billingDocument'],
        remoteKeys: ['billingDocument'],
      },
      {
        targetType: 'outbound_delivery_headers',
        relation:   'referencedDelivery',
        localKeys:  ['referenceDocument'],
        remoteKeys: ['deliveryDocument'],
      },
      {
        targetType: 'product_descriptions',
        relation:   'productInfo',
        localKeys:  ['material'],
        remoteKeys: ['product'],
      }
    ],
  },

  payments_accounts_receivable: {
    table:   'payments_accounts_receivable',
    pk:      ['accountingDocument', 'companyCode', 'fiscalYear'],
    label:   'Payment',
    labelFn: (row) => `Payment #${row.accountingDocument}`,
    relations: [
      {
        targetType: 'business_partners',
        relation:   'payer',
        localKeys:  ['customer'],
        remoteKeys: ['businessPartner'],
      }
    ],
  },

  plants: {
    table:   'plants',
    pk:      ['plant'],
    label:   'Plant',
    labelFn: (row) => row.plantName || row.plant,
    relations: [],
  },

  product_descriptions: {
    table:   'product_descriptions',
    pk:      ['product', 'language'],
    label:   'Product',
    labelFn: (row) => row.productDescription || row.product,
    relations: [
       {
        targetType: 'sales_order_items',
        relation:   'orderedIn',
        localKeys:  ['product'],
        remoteKeys: ['material'],
      }
    ],
  },
};

function makeNodeId(entityType, row) {
  const cfg = ENTITIES[entityType];
  if (!cfg) return `${entityType}::${Math.random()}`; // Fallback
  const keyParts = cfg.pk.map((k) => row[k]);
  return `${entityType}::${keyParts.join('::')}`;
}

function makeNode(entityType, row) {
  const cfg = ENTITIES[entityType];
  return {
    id:    makeNodeId(entityType, row),
    label: cfg.labelFn(row),
    type:  cfg.label,
    data:  row,
  };
}

async function detectEntityType(rawId, hintType) {
  const candidates = hintType && ENTITIES[hintType]
    ? [hintType]
    : Object.keys(ENTITIES);

  for (const entityType of candidates) {
    const cfg = ENTITIES[entityType];

    const parts = rawId.split('::');
    if (parts.length !== cfg.pk.length) continue;

    const conditions = cfg.pk.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ');
    const sql = `SELECT * FROM ${cfg.table} WHERE ${conditions} LIMIT 1`;
    try {
      const { rows } = await pool.query(sql, parts);
      if (rows.length) return { entityType, row: rows[0] };
    } catch (e) { /* skip */ }
  }
  return null;
}

async function fetchRelated(rel, sourceRow) {
  const targetCfg = ENTITIES[rel.targetType];
  if (!targetCfg) return [];

  const params = rel.localKeys.map((k) => sourceRow[k]);
  if (params.some((p) => p == null || p === '')) return [];

  const conditions = rel.remoteKeys
    .map((k, i) => `"${k}" = $${i + 1}`)
    .join(' AND ');
  const sql = `SELECT * FROM ${targetCfg.table} WHERE ${conditions}`;

  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch {
    return [];
  }
}

async function buildGraph(rawId, hintType, depth = 1) {
  const root = await detectEntityType(rawId, hintType);
  if (!root) return null;

  const nodesMap = new Map();
  const edgesSet = new Set();
  const edges    = [];
  const queue    = [{ entityType: root.entityType, row: root.row, hop: 0 }];

  while (queue.length) {
    const { entityType, row, hop } = queue.shift();
    const cfg = ENTITIES[entityType];
    const nid = makeNodeId(entityType, row);

    if (!nodesMap.has(nid)) {
      nodesMap.set(nid, makeNode(entityType, row));
    }

    if (hop >= depth) continue;

    for (const rel of cfg.relations) {
      const relatedRows = await fetchRelated(rel, row);

      for (const relRow of relatedRows) {
        const targetNid = makeNodeId(rel.targetType, relRow);
        const edgeKey   = `${nid}→${rel.relation}→${targetNid}`;

        if (!edgesSet.has(edgeKey)) {
          edgesSet.add(edgeKey);
          edges.push({ source: nid, target: targetNid, relation: rel.relation });
        }

        if (!nodesMap.has(targetNid)) {
          queue.push({ entityType: rel.targetType, row: relRow, hop: hop + 1 });
        }
      }
    }
  }

  return {
    rootId: makeNodeId(root.entityType, root.row),
    nodes:  Array.from(nodesMap.values()),
    edges,
  };
}

async function getOverview() {
  const nodesMap = new Map();
  const edges    = [];

  function addNode(entityType, row) {
    const node = makeNode(entityType, row);
    if (!nodesMap.has(node.id)) nodesMap.set(node.id, node);
    return node;
  }

  function addEdge(sourceId, targetId, relation) {
    edges.push({ source: sourceId, target: targetId, relation });
  }

  try {
    // 1. Recent Orders
    const { rows: orderRows } = await pool.query(
      `SELECT * FROM sales_order_headers ORDER BY "creationDate" DESC NULLS LAST LIMIT 200`
    );
    const orderNodeMap = {};
    for (const row of orderRows) {
      orderNodeMap[row.salesOrder] = addNode('sales_order_headers', row);
    }

    // 2. Customers
    const partnerIds = [...new Set(orderRows.map(r => r.soldToParty).filter(Boolean))];
    const customerMap = {};
    if (partnerIds.length > 0) {
      const { rows: custRows } = await pool.query(
        `SELECT * FROM business_partners WHERE "businessPartner" = ANY($1)`,
        [partnerIds]
      );
      for (const row of custRows) {
        customerMap[row.businessPartner] = addNode('business_partners', row);
      }
    }
    for (const row of orderRows) {
      if (row.soldToParty && customerMap[row.soldToParty]) {
        addEdge(customerMap[row.soldToParty].id, orderNodeMap[row.salesOrder].id, 'placedOrder');
      }
    }

    // 3. Deliveries
    const { rows: diRows } = await pool.query(
      `SELECT DISTINCT ON ("deliveryDocument") * FROM outbound_delivery_items
       WHERE "referenceSdDocument" = ANY($1) LIMIT 150`,
      [orderRows.map(r => r.salesOrder)]
    );
    const delivDocIds = diRows.map(r => r.deliveryDocument);
    const deliveryMap = {};
    if (delivDocIds.length > 0) {
      const { rows: dhRows } = await pool.query(
        `SELECT * FROM outbound_delivery_headers WHERE "deliveryDocument" = ANY($1)`,
        [delivDocIds]
      );
      for (const row of dhRows) {
        deliveryMap[row.deliveryDocument] = addNode('outbound_delivery_headers', row);
      }
    }
    for (const diRow of diRows) {
      const oNode = orderNodeMap[diRow.referenceSdDocument];
      const dNode = deliveryMap[diRow.deliveryDocument];
      if (oNode && dNode) addEdge(oNode.id, dNode.id, 'fulfilledBy');
    }

    // 4. Invoices
    const { rows: biRows } = await pool.query(
      `SELECT DISTINCT ON ("billingDocument") * FROM billing_document_items
       WHERE "referenceDocument" = ANY($1) LIMIT 150`,
      [delivDocIds]
    );
    const billDocIds = biRows.map(r => r.billingDocument);
    const invoiceMap = {};
    if (billDocIds.length > 0) {
      const { rows: bhRows } = await pool.query(
        `SELECT * FROM billing_document_headers WHERE "billingDocument" = ANY($1)`,
        [billDocIds]
      );
      for (const row of bhRows) {
        invoiceMap[row.billingDocument] = addNode('billing_document_headers', row);
      }
    }
    for (const biRow of biRows) {
      const dNode = deliveryMap[biRow.referenceDocument];
      const iNode = invoiceMap[biRow.billingDocument];
      if (dNode && iNode) addEdge(dNode.id, iNode.id, 'invoicedThrough');
    }

  } catch (err) {
    console.error('[graphService] getOverview error:', err.message);
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
  };
}

module.exports = { buildGraph, getOverview };
