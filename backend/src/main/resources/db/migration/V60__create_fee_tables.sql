-- 회비 관리 Sprint 1: 동아리별 회비 정책(fee_policy)과 회원별 청구서(fee_bill)를 추가한다.
-- 금액은 정수 원(BIGINT), 상태/유형은 VARCHAR+CHECK. 신규 테이블은 RLS 를 켠다(V59 정책 준수).
CREATE TABLE fee_policy (
    id           BIGSERIAL PRIMARY KEY,
    club_id      BIGINT       NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    name         VARCHAR(100) NOT NULL,
    amount       BIGINT       NOT NULL CHECK (amount >= 0),
    billing_type VARCHAR(20)  NOT NULL CHECK (billing_type IN ('MONTHLY','SEMESTER','YEARLY','ONE_TIME')),
    active       BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_fee_policy_club ON fee_policy (club_id) WHERE deleted_at IS NULL;
ALTER TABLE fee_policy ENABLE ROW LEVEL SECURITY;

CREATE TABLE fee_bill (
    id                 BIGSERIAL PRIMARY KEY,
    club_id            BIGINT      NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    user_id            BIGINT      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    fee_policy_id      BIGINT      NOT NULL REFERENCES fee_policy(id) ON DELETE RESTRICT,
    amount             BIGINT      NOT NULL CHECK (amount >= 0),
    billing_period     VARCHAR(30) NOT NULL,
    billing_start_date DATE        NOT NULL,
    billing_end_date   DATE        NOT NULL,
    due_date           DATE        NOT NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','PAID','PARTIAL_PAID','OVERDUE','CANCELLED')),
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_fee_bill_period_range CHECK (billing_end_date >= billing_start_date),
    CONSTRAINT chk_fee_bill_due_in_range  CHECK (due_date >= billing_start_date)
);
-- 멱등: 같은 정책·회원·회차(시작일)는 1건, 취소건은 제외해 재발행 허용
CREATE UNIQUE INDEX uk_fee_bill_idem ON fee_bill (fee_policy_id, user_id, billing_start_date)
    WHERE deleted_at IS NULL AND status <> 'CANCELLED';
CREATE INDEX idx_fee_bill_club_status ON fee_bill (club_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_fee_bill_user ON fee_bill (user_id) WHERE deleted_at IS NULL;
ALTER TABLE fee_bill ENABLE ROW LEVEL SECURITY;
