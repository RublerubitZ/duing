CREATE TABLE bank_matching_setting (
    id             BIGSERIAL PRIMARY KEY,
    club_id        BIGINT NOT NULL UNIQUE REFERENCES club(id) ON DELETE RESTRICT,
    active         BOOLEAN NOT NULL DEFAULT FALSE,
    api_registered BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMP WITH TIME ZONE
);
ALTER TABLE bank_matching_setting ENABLE ROW LEVEL SECURITY;

CREATE TABLE bank_transaction (
    id                  BIGSERIAL PRIMARY KEY,
    club_id             BIGINT NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    bank_code           VARCHAR(10) NOT NULL,
    transaction_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    amount              BIGINT NOT NULL,
    balance             BIGINT,
    counterparty        VARCHAR(100),
    transaction_type    VARCHAR(20) NOT NULL CHECK (transaction_type IN ('DEPOSIT','WITHDRAWAL')),
    match_status        VARCHAR(20) NOT NULL CHECK (match_status IN ('PENDING','AUTO_MATCHED','MANUAL_MATCHED','IGNORED')),
    matched_fee_bill_id BIGINT REFERENCES fee_bill(id) ON DELETE RESTRICT,
    transaction_hash    VARCHAR(64) NOT NULL UNIQUE,
    raw_payload         JSONB NOT NULL,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_bank_tx_club_status ON bank_transaction (club_id, match_status) WHERE deleted_at IS NULL;
ALTER TABLE bank_transaction ENABLE ROW LEVEL SECURITY;

ALTER TABLE payment ADD COLUMN bank_transaction_id BIGINT REFERENCES bank_transaction(id) ON DELETE RESTRICT;
CREATE INDEX idx_payment_bank_tx ON payment (bank_transaction_id) WHERE deleted_at IS NULL;
