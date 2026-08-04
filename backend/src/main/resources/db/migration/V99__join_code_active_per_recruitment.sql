-- 가입 코드 귀속의 SoT 를 동아리 → 모집으로 승격한다 (스펙 v2 4.1).
-- 활성 코드 1개 제약도 동아리당 → 모집당으로 옮겨, 한 동아리의 외부 폼 모집이 여럿이면
-- 모집마다 각각 활성 코드를 하나씩 가질 수 있게 한다.
-- 데이터 이관은 없다: 가입 코드는 프로덕션 미출시 기능이고, dev DB 의 v1 코드 행은 QA 후 정리돼 비어 있다.
DROP INDEX IF EXISTS uk_club_join_code_active_per_club;

CREATE UNIQUE INDEX IF NOT EXISTS uk_club_join_code_active_per_recruitment
    ON club_join_code (recruitment_id) WHERE revoked_at IS NULL AND deleted_at IS NULL;
