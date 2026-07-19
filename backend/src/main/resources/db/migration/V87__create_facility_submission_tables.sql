-- 학교 제출(Submission Batch) — 스펙 docs/superpowers/specs/2026-07-19-facility-submission-batch-design.md
-- batch.cancelled_at 은 soft delete 가 아니라 비즈니스 상태다: 취소돼도 이력에 계속 표시(§2).
-- 중복 제출 방지는 애플리케이션이 보장한다(booking 행잠금 + 활성 EXISTS, §4) —
-- item 활성 여부가 batch 상태에 종속돼 단일 테이블 부분 유니크 인덱스를 걸 수 없다.
CREATE TABLE facility_submission_batch (
    id            BIGSERIAL PRIMARY KEY,
    submission_no VARCHAR(20)  NOT NULL UNIQUE,
    facility_id   BIGINT       NOT NULL REFERENCES facility (id),
    submitted_by  BIGINT       NOT NULL REFERENCES users (id),
    submitted_at  TIMESTAMP    NOT NULL,
    memo          VARCHAR(500),
    csv_file_name VARCHAR(100) NOT NULL,
    cancelled_at  TIMESTAMP,
    cancelled_by  BIGINT REFERENCES users (id),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);

CREATE TABLE facility_submission_item (
    id         BIGSERIAL PRIMARY KEY,
    batch_id   BIGINT NOT NULL REFERENCES facility_submission_batch (id),
    booking_id BIGINT NOT NULL REFERENCES facility_booking (id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_facility_submission_item_batch ON facility_submission_item (batch_id);
CREATE INDEX idx_facility_submission_item_booking ON facility_submission_item (booking_id);

-- 일자별 채번(§3) — SELECT ... FOR UPDATE 로 직렬화. BaseEntity 미상속(자연키 PK).
CREATE TABLE facility_submission_seq (
    seq_date   DATE PRIMARY KEY,
    next_value INT NOT NULL
);

-- append-only 감사(§2) — auth_event 와 동일 원칙, 수정 메서드 없음.
CREATE TABLE facility_submission_audit (
    id         BIGSERIAL PRIMARY KEY,
    batch_id   BIGINT      NOT NULL REFERENCES facility_submission_batch (id),
    action     VARCHAR(20) NOT NULL,
    admin_id   BIGINT      NOT NULL REFERENCES users (id),
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_facility_submission_audit_batch ON facility_submission_audit (batch_id, created_at);

ALTER TABLE facility_submission_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_submission_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_submission_seq ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_submission_audit ENABLE ROW LEVEL SECURITY;
