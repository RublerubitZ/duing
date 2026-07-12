-- 시설 대관 신청. 크롤 미러(facility_reservation)는 월 단위 delete+insert 전면 교체이므로
-- 신청 데이터는 반드시 별도 테이블이어야 한다(설계 §6.1).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE facility_booking (
    id                   BIGSERIAL PRIMARY KEY,
    facility_id          BIGINT       NOT NULL REFERENCES facility (id),
    club_id              BIGINT       NOT NULL REFERENCES club (id),
    applicant_id         BIGINT       NOT NULL REFERENCES users (id),
    reservation_date     DATE         NOT NULL,
    start_time           TIME         NOT NULL,
    end_time             TIME         NOT NULL,
    purpose              VARCHAR(200) NOT NULL,
    attendee_count       INT,
    status               VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    reject_reason        VARCHAR(500),
    conflict_detail      VARCHAR(500),
    matched_schedule_seq BIGINT,
    crawl_basis_at       TIMESTAMP,
    decided_by           BIGINT       REFERENCES users (id),
    decided_at           TIMESTAMP,
    confirmed_at         TIMESTAMP,
    version              BIGINT       NOT NULL DEFAULT 0,
    created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMP,
    CONSTRAINT chk_facility_booking_time
        CHECK (start_time >= TIME '09:00' AND end_time <= TIME '22:00' AND start_time < end_time),
    CONSTRAINT chk_facility_booking_status
        CHECK (status IN ('PENDING', 'APPROVED', 'CONFIRMED', 'REJECTED', 'CONFLICT', 'CANCELLED'))
);

-- 활성(APPROVED/CONFIRMED) 예약의 시설·시간 겹침을 DB 레벨에서 차단 — 승인 로직을 우회하는
-- 어떤 경로(버그·수동 SQL)도 이중 승인을 커밋할 수 없다(설계 §6.1). 위반 시
-- DataIntegrityViolationException → GlobalExceptionHandler 가 409 로 변환한다.
ALTER TABLE facility_booking
    ADD CONSTRAINT excl_facility_booking_active_overlap
    EXCLUDE USING gist (
        facility_id WITH =,
        (tsrange(reservation_date + start_time, reservation_date + end_time)) WITH &&
    ) WHERE (status IN ('APPROVED', 'CONFIRMED') AND deleted_at IS NULL);

CREATE INDEX idx_facility_booking_slot ON facility_booking (facility_id, reservation_date);
CREATE INDEX idx_facility_booking_club ON facility_booking (club_id, created_at DESC);
CREATE INDEX idx_facility_booking_queue ON facility_booking (status, reservation_date)
    WHERE status IN ('PENDING', 'APPROVED', 'CONFLICT');

ALTER TABLE facility_booking ENABLE ROW LEVEL SECURITY;
