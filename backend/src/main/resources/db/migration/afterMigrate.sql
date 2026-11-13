-- Flyway 콜백 — 기동할 때마다 migrate 가 끝난 뒤 한 번 실행된다(버전 마이그레이션이 아니라 이력에 남지 않는다).
--
-- flyway_schema_history 에 RLS 를 켠다 — V59 가 "Flyway 내부 제어 테이블"이라며 뺀 마지막 public 테이블.
-- Supabase 는 public 에 생기는 모든 테이블에 anon·authenticated 전체 권한(SELECT·INSERT·UPDATE·DELETE)을 기본으로 붙인다.
-- 그래서 RLS 가 꺼진 이 테이블은 Data API 가 켜진 프로젝트에서 공개 키만으로 읽고 고칠 수 있었다
-- (2026-11-13 개발 DB 실측: 공개 키로 이력 행이 조회됨). 이력이 지워지거나 바뀌면 다음 기동의 Flyway 검증이 깨진다.
-- 정책은 만들지 않는다(V59 와 같은 잠금 상태). Flyway 와 앱은 테이블 소유자 롤로 접속해 RLS 를 받지 않는다.
--
-- 버전 마이그레이션(V__)으로는 할 수 없다 — migrate 중에는 Flyway 의 다른 연결이 이 테이블의 잠금을 쥔 트랜잭션을
-- 열어 두고 있어, 마이그레이션 안의 ALTER 가 그 잠금을 영원히 기다린다(기동이 멈춘다). 콜백은 그 트랜잭션이 끝난 뒤에 돈다.
-- 이미 켜져 있으면 아무것도 하지 않는다 — ALTER 의 ACCESS EXCLUSIVE 잠금이 백업 덤프 같은 긴 읽기 뒤에서 기동을 붙잡지 않게.
DO $$
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'flyway_schema_history'::regclass) THEN
        ALTER TABLE flyway_schema_history ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;
