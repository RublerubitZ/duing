-- public 스키마의 모든 테이블에 RLS(Row Level Security)를 켠다.
-- 백엔드는 테이블 소유자(postgres) 롤로 접속해 RLS 를 우회하므로 애플리케이션 동작에는 영향이 없고,
-- Supabase 자동 REST API 가 쓰는 anon/authenticated 롤만 전면 차단되어 PII(이메일·학번 등) 노출을 막는다.
-- 정책(policy)은 일부러 만들지 않는다 — 정책 없음 = 비소유 롤 전면 거부 = 의도된 잠금 상태.
-- 운영 DB 에는 이미 수동 적용돼 있어 재적용은 멱등하다(ENABLE 은 반복 실행해도 무해).
-- 신규 테이블은 각자의 생성 마이그레이션에서 RLS 를 함께 켜야 한다(이 마이그레이션은 V59 시점 테이블만 처리).
DO $$
DECLARE
    table_record record;
BEGIN
    FOR table_record IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_record.tablename);
    END LOOP;
END $$;
