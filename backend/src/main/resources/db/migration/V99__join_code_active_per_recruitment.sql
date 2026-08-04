-- 가입 코드 귀속의 SoT 를 동아리 → 모집으로 승격한다 (스펙 v2 4.1).
-- 활성 코드 1개 제약도 동아리당 → 모집당으로 옮겨, 한 동아리의 외부 폼 모집이 여럿이면
-- 모집마다 각각 활성 코드를 하나씩 가질 수 있게 한다.
-- 데이터 이관은 없다: 가입 코드는 프로덕션 미출시 기능이고, dev DB 의 v1 코드 행은 QA 후 정리돼 비어 있다.
DROP INDEX IF EXISTS uk_club_join_code_active_per_club;

-- 삭제된 모집에 매달린 미폐기 코드를 정리한다. v1 은 "귀속 모집 OPEN" 을 사용 가능 조건으로 봐서
-- 이런 행이 사실상 죽은 코드였지만, 이 릴리스에서 그 조건이 빠지면서 되살아난다. 운영 콘솔은 살아 있는
-- 모집을 통해서만 코드에 접근하므로 API 로는 폐기할 수도 없다 — 남은 행이 없다는 가정에 기대지 않고 막는다.
UPDATE club_join_code
   SET revoked_at = NOW()
 WHERE revoked_at IS NULL
   AND recruitment_id IN (SELECT id FROM recruitment WHERE deleted_at IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uk_club_join_code_active_per_recruitment
    ON club_join_code (recruitment_id) WHERE revoked_at IS NULL AND deleted_at IS NULL;
