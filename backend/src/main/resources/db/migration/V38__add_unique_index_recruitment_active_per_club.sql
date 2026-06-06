-- 동아리당 활성(OPEN) 모집 공고는 1건만 허용.
-- 두 운영진이 동시에 같은 동아리의 모집을 생성할 때 발생하는 race condition
-- (existsActiveByClubId 사전 체크 → INSERT 사이의 TOCTOU 갭) 을 DB 레벨에서 차단한다.
--
-- predicate 에 endDate >= CURRENT_DATE 는 포함할 수 없다 (PostgreSQL 은 인덱스 predicate 에
-- immutable 함수만 허용하므로 CURRENT_DATE 사용 불가). status='OPEN' 만으로 활성을 정의하며,
-- OPEN-but-past-endDate 상태는 운영진이 close() / replaceActive() 로 해소하도록 한다.
CREATE UNIQUE INDEX IF NOT EXISTS uk_recruitment_club_active
    ON recruitment (club_id)
    WHERE status = 'OPEN' AND deleted_at IS NULL;
