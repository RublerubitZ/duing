-- 회장 승계 요청 동시 처리(REJECTED vs APPROVED, REJECTED vs REJECTED) 시
-- 후행 트랜잭션의 UPDATE 가 0 row affected 로 OptimisticLock 충돌 → 자동 롤백되어
-- request.status 와 club_member 권한 변경 결과가 불일치하지 않도록 한다.
--
-- 기존 process() 의 REJECTED 분기는 락도 재조회도 없이 stale entity 의 메모리 상태만으로
-- terminal 체크를 통과시키고 UPDATE 를 쏘기 때문에, 다른 운영진이 같은 요청을 먼저 APPROVED
-- 처리해 club_member 권한이 이미 이전된 뒤에도 status='REJECTED' 로 덮어쓸 수 있었다.
ALTER TABLE leader_succession_request
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

-- DEFAULT 는 기존 행 백필용으로만 사용하고, Hibernate 가 직접 채우도록 제거.
ALTER TABLE leader_succession_request
    ALTER COLUMN version DROP DEFAULT;
