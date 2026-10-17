CREATE TABLE IF NOT EXISTS auth_tokens (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT                NOT NULL UNIQUE, --SHA-256, never the raw token
    device_label    VARCHAR(64),                         -- 'Windows Desktop', 'Steam Deck'
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ         NOT NULL,
    revoked         BOOLEAN             NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);

-- Housekeeping: drop expired rows. Run occasionally.
-- DELETE FROM auth_tokens WHERE expires_at < NOW();