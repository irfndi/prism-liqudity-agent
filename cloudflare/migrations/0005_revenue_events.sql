-- Migration: Revenue events tracking table
-- Created: 2026-06-07

CREATE TABLE IF NOT EXISTS revenue_events (
    id TEXT PRIMARY KEY,
    pool_address TEXT NOT NULL,
    position_pubkey TEXT,
    fee_x REAL NOT NULL DEFAULT 0,
    fee_y REAL NOT NULL DEFAULT 0,
    platform_fee_x REAL NOT NULL DEFAULT 0,
    platform_fee_y REAL NOT NULL DEFAULT 0,
    tier TEXT NOT NULL DEFAULT 'free',
    user_id TEXT,
    install_id TEXT,
    tx_signature TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_revenue_pool ON revenue_events(pool_address);
CREATE INDEX IF NOT EXISTS idx_revenue_user ON revenue_events(user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_install ON revenue_events(install_id);
CREATE INDEX IF NOT EXISTS idx_revenue_created ON revenue_events(created_at);
CREATE INDEX IF NOT EXISTS idx_revenue_tier ON revenue_events(tier);
