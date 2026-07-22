-- 대표 활동 6 슬롯. 기존 활동사진(club_photo)을 FK 참조하는 큐레이션 — 이미지 중복 저장 없음.
-- display_order 는 1..6 슬롯 번호(노출 순서). 삭제 시 순서를 당기지 않고 빈 슬롯으로 유지한다.
-- max 6 은 부분 유니크(club_id, display_order)가 구조적으로 보장한다(범위 검증은 앱 레이어 1..6).
CREATE TABLE IF NOT EXISTS club_hero_activity (
    id            BIGSERIAL PRIMARY KEY,
    club_id       BIGINT       NOT NULL REFERENCES club (id),
    club_photo_id BIGINT       NOT NULL REFERENCES club_photo (id),
    title         VARCHAR(30)  NOT NULL,
    description   VARCHAR(80)  NOT NULL,
    display_order INT          NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_club_hero_activity_slot
    ON club_hero_activity (club_id, display_order) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_club_hero_activity_photo
    ON club_hero_activity (club_id, club_photo_id) WHERE deleted_at IS NULL;
