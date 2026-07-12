-- 예약 상태 전이 audit log. append-only — application_status_history(V43)와 동일 원칙.
-- changed_by NULL = 시스템 자동 전이(매칭 잡). crawl_basis_at = 전이 판단에 사용한 크롤 스냅샷 시각.
CREATE TABLE facility_booking_status_history (
    id              BIGSERIAL PRIMARY KEY,
    booking_id      BIGINT      NOT NULL REFERENCES facility_booking (id),
    previous_status VARCHAR(20),
    new_status      VARCHAR(20) NOT NULL,
    changed_by      BIGINT      REFERENCES users (id),
    reason          VARCHAR(500),
    crawl_basis_at  TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_fbsh_booking ON facility_booking_status_history (booking_id, created_at);

ALTER TABLE facility_booking_status_history ENABLE ROW LEVEL SECURITY;
