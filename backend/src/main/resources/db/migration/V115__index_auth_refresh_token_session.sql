-- auth_refresh_token.session_id 일반 인덱스 (성능 감사 P1-4).
--
-- V86 의 인덱스는 uq_auth_refresh_token_hash(token_hash) 와 부분 유니크
-- uq_auth_refresh_token_active(session_id) WHERE status='ACTIVE' 둘뿐이다.
-- session_id 를 술어로 쓰는 문장 4종(로그아웃·전 세션 폐기의 revoke UPDATE, 일일 정리의 DELETE,
-- 세션별 토큰 조회)은 status 가 바인드 파라미터거나 술어가 없어 부분 인덱스를 못 타고 seq scan 이며,
-- auth_session 물리 삭제의 FK 역참조 검증도 인덱스 없이 돈다(PostgreSQL 은 FK 를 자동 인덱싱하지 않는다).
--
-- 현재 규모(약 3천 행)에서는 체감이 작지만, 이 테이블은 access 토큰 30분 회전마다 INSERT 되고
-- 폐기 후 30일 보존되는 회전 구조라 성장 방어 성격으로 선제한다. 쓰기 오버헤드는 회전당 인덱스
-- 유지 1개 추가 수준. 부분 유니크는 "세션당 ACTIVE 1개" 불변식 담당이므로 그대로 둔다.
CREATE INDEX IF NOT EXISTS idx_auth_refresh_token_session
    ON auth_refresh_token (session_id);
