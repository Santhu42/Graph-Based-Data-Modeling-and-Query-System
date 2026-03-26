-- =============================================================================
-- FDE – Schema Refinement Migration
-- Run AFTER load_data.js has populated all tables.
-- Adds PRIMARY KEYs, FOREIGN KEY relationships, and performance INDEXes.
-- Safe to re-run: all statements use IF NOT EXISTS / DO blocks.
-- =============================================================================

-- ─── 0. Helper ────────────────────────────────────────────────────────────────
-- PostgreSQL does not support "ADD CONSTRAINT IF NOT EXISTS" directly before v15.
-- We wrap FK additions in DO blocks to skip duplicates gracefully.

-- =============================================================================
-- 1. PRIMARY KEYS
-- =============================================================================

-- business_partners  →  PK: businessPartner
ALTER TABLE business_partners
  ADD PRIMARY KEY ("businessPartner");

-- plants  →  PK: plant
ALTER TABLE plants
  ADD PRIMARY KEY ("plant");

-- sales_order_headers  →  PK: salesOrder
ALTER TABLE sales_order_headers
  ADD PRIMARY KEY ("salesOrder");

-- sales_order_items  →  PK: (salesOrder, salesOrderItem)
ALTER TABLE sales_order_items
  ADD PRIMARY KEY ("salesOrder", "salesOrderItem");

-- sales_order_schedule_lines  →  PK: (salesOrder, salesOrderItem, scheduleLine)
--   (scheduleLine field name – verified from data sample)
ALTER TABLE sales_order_schedule_lines
  ADD PRIMARY KEY ("salesOrder", "salesOrderItem", "scheduleLine");

-- outbound_delivery_headers  →  PK: deliveryDocument
ALTER TABLE outbound_delivery_headers
  ADD PRIMARY KEY ("deliveryDocument");

-- outbound_delivery_items  →  PK: (deliveryDocument, deliveryDocumentItem)
ALTER TABLE outbound_delivery_items
  ADD PRIMARY KEY ("deliveryDocument", "deliveryDocumentItem");

-- billing_document_headers  →  PK: billingDocument
ALTER TABLE billing_document_headers
  ADD PRIMARY KEY ("billingDocument");

-- billing_document_items  →  PK: (billingDocument, billingDocumentItem)
ALTER TABLE billing_document_items
  ADD PRIMARY KEY ("billingDocument", "billingDocumentItem");

-- billing_document_cancellations  →  PK: billingDocument
ALTER TABLE billing_document_cancellations
  ADD PRIMARY KEY ("billingDocument");

-- product_descriptions  →  PK: (product, language)
ALTER TABLE product_descriptions
  ADD PRIMARY KEY ("product", "language");

-- product_plants  →  PK: (product, plant)
ALTER TABLE product_plants
  ADD PRIMARY KEY ("product", "plant");

-- product_storage_locations  →  PK: (product, plant, storageLocation)
ALTER TABLE product_storage_locations
  ADD PRIMARY KEY ("product", "plant", "storageLocation");

-- customer_company_assignments  →  PK: (customer, companyCode)
ALTER TABLE customer_company_assignments
  ADD PRIMARY KEY ("customer", "companyCode");

-- customer_sales_area_assignments  →  PK: (customer, salesOrganization, distributionChannel, division)
ALTER TABLE customer_sales_area_assignments
  ADD PRIMARY KEY ("customer", "salesOrganization", "distributionChannel", "division");

-- business_partner_addresses  →  PK: (businessPartner, addressId)
ALTER TABLE business_partner_addresses
  ADD PRIMARY KEY ("businessPartner", "addressId");

-- journal_entry_items_accounts_receivable  →  PK: (accountingDocument, companyCode, fiscalYear, accountingDocumentItem)
ALTER TABLE journal_entry_items_accounts_receivable
  ADD PRIMARY KEY ("accountingDocument", "companyCode", "fiscalYear", "accountingDocumentItem");

-- payments_accounts_receivable  →  PK: (accountingDocument, companyCode, fiscalYear, accountingDocumentItem)
ALTER TABLE payments_accounts_receivable
  ADD PRIMARY KEY ("accountingDocument", "companyCode", "fiscalYear", "accountingDocumentItem");



-- =============================================================================
-- 2. FOREIGN KEYS
--    Wrapped in DO blocks to silently skip if constraint already exists.
-- =============================================================================

-- ── Sales Order → Business Partner (Sold-To Customer) ─────────────────────────
--    sales_order_headers.soldToParty → business_partners.businessPartner
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_soh_sold_to_party'
  ) THEN
    ALTER TABLE sales_order_headers
      ADD CONSTRAINT fk_soh_sold_to_party
      FOREIGN KEY ("soldToParty") REFERENCES business_partners ("businessPartner");
  END IF;
END $$;

-- ── Sales Order Items → Sales Order Header ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_soi_sales_order'
  ) THEN
    ALTER TABLE sales_order_items
      ADD CONSTRAINT fk_soi_sales_order
      FOREIGN KEY ("salesOrder") REFERENCES sales_order_headers ("salesOrder");
  END IF;
END $$;

-- ── Sales Order Items → Plants (Production Plant) ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_soi_production_plant'
  ) THEN
    ALTER TABLE sales_order_items
      ADD CONSTRAINT fk_soi_production_plant
      FOREIGN KEY ("productionPlant") REFERENCES plants ("plant");
  END IF;
END $$;

-- ── Sales Order Schedule Lines → Sales Order Items ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sosl_sales_order_item'
  ) THEN
    ALTER TABLE sales_order_schedule_lines
      ADD CONSTRAINT fk_sosl_sales_order_item
      FOREIGN KEY ("salesOrder", "salesOrderItem")
      REFERENCES sales_order_items ("salesOrder", "salesOrderItem");
  END IF;
END $$;

-- ── Outbound Delivery Headers → Plants (Shipping Point as Plant) ──────────────
--    shippingPoint codes match plant codes (e.g. WB05, 1920, 1301)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_odh_shipping_point'
  ) THEN
    ALTER TABLE outbound_delivery_headers
      ADD CONSTRAINT fk_odh_shipping_point
      FOREIGN KEY ("shippingPoint") REFERENCES plants ("plant");
  END IF;
END $$;

-- ── Outbound Delivery Items → Outbound Delivery Headers ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_odi_delivery_document'
  ) THEN
    ALTER TABLE outbound_delivery_items
      ADD CONSTRAINT fk_odi_delivery_document
      FOREIGN KEY ("deliveryDocument") REFERENCES outbound_delivery_headers ("deliveryDocument");
  END IF;
END $$;

-- ── Outbound Delivery Items → Plants ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_odi_plant'
  ) THEN
    ALTER TABLE outbound_delivery_items
      ADD CONSTRAINT fk_odi_plant
      FOREIGN KEY ("plant") REFERENCES plants ("plant");
  END IF;
END $$;

-- ── Outbound Delivery Items → Sales Order Headers (Reference Document) ─────────
--    referenceSdDocument on delivery item = salesOrder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_odi_ref_sales_order'
  ) THEN
    ALTER TABLE outbound_delivery_items
      ADD CONSTRAINT fk_odi_ref_sales_order
      FOREIGN KEY ("referenceSdDocument") REFERENCES sales_order_headers ("salesOrder");
  END IF;
END $$;

-- ── Billing Document Items → Billing Document Headers ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_bdi_billing_document'
  ) THEN
    ALTER TABLE billing_document_items
      ADD CONSTRAINT fk_bdi_billing_document
      FOREIGN KEY ("billingDocument") REFERENCES billing_document_headers ("billingDocument");
  END IF;
END $$;

-- ── Business Partner Addresses → Business Partners ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_bpa_business_partner'
  ) THEN
    ALTER TABLE business_partner_addresses
      ADD CONSTRAINT fk_bpa_business_partner
      FOREIGN KEY ("businessPartner") REFERENCES business_partners ("businessPartner");
  END IF;
END $$;

-- ── Customer Company Assignments → Business Partners ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cca_customer'
  ) THEN
    ALTER TABLE customer_company_assignments
      ADD CONSTRAINT fk_cca_customer
      FOREIGN KEY ("customer") REFERENCES business_partners ("businessPartner");
  END IF;
END $$;

-- ── Customer Sales Area Assignments → Business Partners ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_csaa_customer'
  ) THEN
    ALTER TABLE customer_sales_area_assignments
      ADD CONSTRAINT fk_csaa_customer
      FOREIGN KEY ("customer") REFERENCES business_partners ("businessPartner");
  END IF;
END $$;

-- ── Product Plants → Plants ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_pp_plant'
  ) THEN
    ALTER TABLE product_plants
      ADD CONSTRAINT fk_pp_plant
      FOREIGN KEY ("plant") REFERENCES plants ("plant");
  END IF;
END $$;

-- ── Product Storage Locations → Plants ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_psl_plant'
  ) THEN
    ALTER TABLE product_storage_locations
      ADD CONSTRAINT fk_psl_plant
      FOREIGN KEY ("plant") REFERENCES plants ("plant");
  END IF;
END $$;


-- =============================================================================
-- 3. PERFORMANCE INDEXES
-- =============================================================================

-- ── Sales Order Headers ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_soh_sold_to_party         ON sales_order_headers ("soldToParty");
CREATE INDEX IF NOT EXISTS idx_soh_creation_date         ON sales_order_headers ("creationDate");
CREATE INDEX IF NOT EXISTS idx_soh_overall_dlv_status    ON sales_order_headers ("overallDeliveryStatus");

-- ── Sales Order Items ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_soi_material              ON sales_order_items ("material");
CREATE INDEX IF NOT EXISTS idx_soi_production_plant      ON sales_order_items ("productionPlant");
-- (salesOrder, salesOrderItem) covered by PK

-- ── Sales Order Schedule Lines ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sosl_sales_order          ON sales_order_schedule_lines ("salesOrder");

-- ── Outbound Delivery Headers ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_odh_shipping_point        ON outbound_delivery_headers ("shippingPoint");
CREATE INDEX IF NOT EXISTS idx_odh_creation_date         ON outbound_delivery_headers ("creationDate");
CREATE INDEX IF NOT EXISTS idx_odh_goods_mvt_status      ON outbound_delivery_headers ("overallGoodsMovementStatus");

-- ── Outbound Delivery Items ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_odi_plant                 ON outbound_delivery_items ("plant");
CREATE INDEX IF NOT EXISTS idx_odi_ref_sd_document       ON outbound_delivery_items ("referenceSdDocument");
-- deliveryDocument covered by PK

-- ── Billing Document Headers ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bdh_creation_date         ON billing_document_headers ("creationDate");
CREATE INDEX IF NOT EXISTS idx_bdh_sold_to_party         ON billing_document_headers ("soldToParty");

-- ── Billing Document Items ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bdi_material              ON billing_document_items ("material");

-- ── Business Partners ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bp_customer               ON business_partners ("customer");
CREATE INDEX IF NOT EXISTS idx_bp_grouping               ON business_partners ("businessPartnerGrouping");

-- ── Plants ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plants_sales_org          ON plants ("salesOrganization");

-- ── Product Plants ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pp_product               ON product_plants ("product");
CREATE INDEX IF NOT EXISTS idx_pp_plant                 ON product_plants ("plant");

-- ── Product Storage Locations ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_psl_product               ON product_storage_locations ("product");
CREATE INDEX IF NOT EXISTS idx_psl_plant                 ON product_storage_locations ("plant");

-- ── Journal / Payments ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jei_customer              ON journal_entry_items_accounts_receivable ("customer");
CREATE INDEX IF NOT EXISTS idx_jei_posting_date          ON journal_entry_items_accounts_receivable ("postingDate");
CREATE INDEX IF NOT EXISTS idx_pay_customer              ON payments_accounts_receivable ("customer");


-- =============================================================================
-- 4. QUICK VERIFICATION QUERIES (run manually to check)
-- =============================================================================
/*
-- Count rows per table
SELECT 'sales_order_headers'    , COUNT(*) FROM sales_order_headers    UNION ALL
SELECT 'sales_order_items'      , COUNT(*) FROM sales_order_items      UNION ALL
SELECT 'outbound_delivery_headers', COUNT(*) FROM outbound_delivery_headers UNION ALL
SELECT 'outbound_delivery_items', COUNT(*) FROM outbound_delivery_items UNION ALL
SELECT 'business_partners'      , COUNT(*) FROM business_partners      UNION ALL
SELECT 'plants'                 , COUNT(*) FROM plants;

-- Customer order-to-delivery trace example
SELECT
  bp."businessPartnerFullName"  AS customer,
  soh."salesOrder",
  soh."overallDeliveryStatus",
  odi."deliveryDocument",
  odi."plant",
  p."plantName"
FROM business_partners    bp
JOIN sales_order_headers  soh ON soh."soldToParty"        = bp."businessPartner"
JOIN outbound_delivery_items odi ON odi."referenceSdDocument" = soh."salesOrder"
JOIN plants               p   ON p."plant"                = odi."plant"
LIMIT 20;
*/
