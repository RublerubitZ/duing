-- 부원 초대 링크(스펙 2026-08-08): recruitment_id NULL = 동아리 단위 초대 링크.
-- 모집 링크의 정책·인덱스(V99)는 무변경. Expand-only — 구 이미지는 초대 링크 행을
-- findByCode INNER JOIN 에서 걸러 404 fail-closed 로 처리한다.
ALTER TABLE club_join_code ALTER COLUMN recruitment_id DROP NOT NULL;
ALTER TABLE club_join_code ADD COLUMN invite_expires_at TIMESTAMP;
ALTER TABLE club_join_code ADD COLUMN auto_approve BOOLEAN NOT NULL DEFAULT false;

-- 링크 2종의 형태 불변식: 모집 링크 ⟺ 파생 만료(join_window_days), 초대 링크 ⟺ 절대 만료.
ALTER TABLE club_join_code ADD CONSTRAINT ck_club_join_code_link_shape
    CHECK ((recruitment_id IS NULL) = (invite_expires_at IS NOT NULL));

-- 동아리당 부원 초대 활성 링크 1개 (모집 링크의 uk_club_join_code_active_per_recruitment 와 배타 영역)
CREATE UNIQUE INDEX uk_club_join_code_active_invite_per_club
    ON club_join_code (club_id)
    WHERE recruitment_id IS NULL AND revoked_at IS NULL AND deleted_at IS NULL;

-- maxUses 상한 500→150 통일(스펙 §2.1) — 단, 폐기 행은 유예한다.
-- prod 에 max_uses=200 인 폐기 이력 행이 실존(릴리스 게이트 실측 1건)하고, 이력 행의 상한을
-- 강제 축소하는 UPDATE 는 감사 왜곡이라 금지다. 폐기 행의 max_uses 는 불변·운영상 무의미하므로
-- "살아있는 링크는 150 을 넘을 수 없다"가 정확한 불변식이다. NOT VALID 는 대안이 아니다 —
-- 폐기 행의 PENDING 거절이 환급 UPDATE 로 행 재검증을 트리거해 거절 처리가 실패한다.
ALTER TABLE club_join_code DROP CONSTRAINT club_join_code_max_uses_check;
ALTER TABLE club_join_code ADD CONSTRAINT club_join_code_max_uses_check
    CHECK (max_uses >= 1 AND (max_uses <= 150 OR revoked_at IS NOT NULL));
