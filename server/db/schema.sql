-- Strive: We Are Zonis - Core schema 
-- Run: psql -h localhost -U postgres -d strive_zonis -f db/schema.sql

CREATE TABLE IF NOT EXISTS users (
    id                  SERIAL PRIMARY KEY,
    username            VARCHAR(20)         NOT NULL,
    username_lower      VARCHAR(20)         NOT NULL UNIQUE,        -- case-insensitive uniqueness
    email               VARCHAR(255)        NOT NULL UNIQUE,
    password_hash       TEXT                NOT NULL,

    elo                 INTEGER             NOT NULL DEFAULT 1000,
    rank                VARCHAR(24)         NOT NULL DEFAULT 'Unranked',
    wins                INTEGER             NOT NULL DEFAULT 0,
    losses              INTEGER             NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    last_login_at       TIMESTAMPTZ,
    is_banned           BOOLEAN             NOT NULL DEFAULT FALSE,

    CONSTRAINT username_format CHECK (username ~ '^[A-Za-z0-9_]{3,20}$')        
);

CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo DESC);

-- saved PvP decks. Needed for the Build Deck screen:
CREATE TABLE IF NOT EXISTS decks (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                VARCHAR(40)     NOT NULL DEFAULT 'Main Deck', 
    card_ids            INTEGER[]       NOT NULL,
    is_active           BOOLEAN         NOT NULL DEFAULT FALSE,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);

-- Only one active deck per user:
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_deck ON decks(user_id) WHERE is_active; 