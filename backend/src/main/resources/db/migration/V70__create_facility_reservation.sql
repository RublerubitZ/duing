-- 월별 예약 스냅샷. 원본 1시간 슬롯을 그대로 저장하고 병합은 조회 시 SlotMerger 로 수행한다.
-- schedule_seq 는 학교 전역 자연키 → UNIQUE 로 중복 방지. FK 는 ON DELETE 없음(무결성 보존).
-- year_month 는 VARCHAR(7)('YYYY-MM'), 엔티티는 YearMonth 컨버터로 매핑한다.
CREATE TABLE facility_reservation (
    id                BIGSERIAL PRIMARY KEY,
    facility_id       BIGINT       NOT NULL REFERENCES facility(id),
    schedule_seq      BIGINT       NOT NULL UNIQUE,
    year_month        VARCHAR(7)   NOT NULL,
    reservation_date  DATE         NOT NULL,
    start_time        TIME         NOT NULL,
    end_time          TIME         NOT NULL,
    organization_name VARCHAR(200) NOT NULL,
    crawled_at        TIMESTAMP    NOT NULL,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMP
);
CREATE INDEX idx_facility_reservation_lookup
    ON facility_reservation (facility_id, year_month, reservation_date);
ALTER TABLE facility_reservation ENABLE ROW LEVEL SECURITY;
