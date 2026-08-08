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

-- maxUses 상한 500→150 통일(스펙 §2.1). ADD CONSTRAINT 는 기존 행을 검증한다 —
-- dev 0건 실측, prod 는 릴리스 게이트에서 0건 확인 후 배포(강제 축소 UPDATE 금지).
ALTER TABLE club_join_code DROP CONSTRAINT club_join_code_max_uses_check;
ALTER TABLE club_join_code ADD CONSTRAINT club_join_code_max_uses_check CHECK (max_uses BETWEEN 1 AND 150);
