-- payment : fee_bill 1건에 대한 납부 기록(분할 입금 시 여러 행). 정정은 VOID 로 이력 보존.
CREATE TABLE payment (
    id            BIGSERIAL PRIMARY KEY,
    fee_bill_id   BIGINT NOT NULL REFERENCES fee_bill(id) ON DELETE RESTRICT,
    amount        BIGINT NOT NULL CHECK (amount > 0),
    method        VARCHAR(20) NOT NULL
                  CHECK (method IN ('CASH','TRANSFER','OTHER','AUTO_MATCHED')),  -- AUTO_MATCHED=Sprint 3 자동매칭 전용
    paid_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    recorded_by   BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    memo          VARCHAR(200),
    status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
    voided_by     BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    voided_at     TIMESTAMP WITH TIME ZONE,
    void_reason   VARCHAR(200),
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_payment_bill ON payment (fee_bill_id) WHERE deleted_at IS NULL;
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
