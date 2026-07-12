-- 사용 목적 Preset — 신청 폼 입력 보조 UX(설계 §6.3). 서버는 최종 텍스트만 저장하므로 FK 없음.
CREATE TABLE facility_booking_purpose_preset (
    id         BIGSERIAL   PRIMARY KEY,
    label      VARCHAR(50) NOT NULL UNIQUE,
    sort_order INT         NOT NULL DEFAULT 0,
    active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

ALTER TABLE facility_booking_purpose_preset ENABLE ROW LEVEL SECURITY;

INSERT INTO facility_booking_purpose_preset (label, sort_order) VALUES
    ('동아리 정기 모임', 0),
    ('동아리 정기 연습', 1),
    ('정기 합주', 2),
    ('공연 연습', 3),
    ('행사 준비', 4),
    ('회의', 5),
    ('세미나', 6),
    ('신입부원 교육', 7),
    ('촬영', 8);
