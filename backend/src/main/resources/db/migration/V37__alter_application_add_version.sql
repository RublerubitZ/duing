-- 지원서 상태 전이 동시성 제어를 위한 Optimistic Lock 컬럼.
-- 두 운영진이 동일 지원서를 동시에 ACCEPTED / REJECTED 로 변경할 때
-- 후행 트랜잭션이 0 row affected 로 OptimisticLock 충돌 → 자동 롤백되어
-- Application.status 와 ClubMember 생성 상태가 불일치하지 않도록 한다.
ALTER TABLE application
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

-- DEFAULT 는 기존 행 백필용으로만 사용하고, Hibernate 가 직접 채우도록 제거.
ALTER TABLE application
    ALTER COLUMN version DROP DEFAULT;
