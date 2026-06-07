-- Migration: Add fee_transfer_tx_signature column to revenue_events
-- Created: 2026-06-07

ALTER TABLE revenue_events ADD COLUMN fee_transfer_tx_signature TEXT;
