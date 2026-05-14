-- RBAC 도입: 5단계 권한 모델 (Global = STUDENT/ADMIN, Club-scoped = MEMBER/OFFICER/LEADER).
-- 기존 club.leader_id 단일 컬럼은 club_member 로 정규화 후 제거.

CREATE TABLE IF NOT EXISTS club_member (
    id         BIGSERIAL PRIMARY KEY,
    club_id    BIGINT      NOT NULL REFERENCES club (id),
    user_id    BIGINT      NOT NULL REFERENCES users (id),
    role       VARCHAR(20) NOT NULL,
    created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- 동일 동아리 내 활성 멤버십은 1건만 (탈퇴/추방 후 재가입 허용).
CREATE UNIQUE INDEX IF NOT EXISTS uk_club_member_club_user_active
    ON club_member (club_id, user_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_club_member_club ON club_member (club_id);
CREATE INDEX IF NOT EXISTS idx_club_member_user ON club_member (user_id);
CREATE INDEX IF NOT EXISTS idx_club_member_role ON club_member (role);

-- 기존 club.leader_id 를 LEADER 멤버십으로 백필.
INSERT INTO club_member (club_id, user_id, role)
SELECT c.id, c.leader_id, 'LEADER'
FROM club c
WHERE c.leader_id IS NOT NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM club_member cm
    WHERE cm.club_id = c.id
      AND cm.user_id = c.leader_id
      AND cm.deleted_at IS NULL
  );

-- 더 이상 사용하지 않는 leader_id 컬럼·인덱스 제거.
DROP INDEX IF EXISTS idx_club_leader;
ALTER TABLE club DROP COLUMN IF EXISTS leader_id;
