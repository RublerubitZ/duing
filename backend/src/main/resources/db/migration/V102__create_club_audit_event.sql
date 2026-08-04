-- 동아리 단위 운영 감사 이벤트 스트림 (스펙 v2 4.1).
-- 이번 릴리스가 기록하는 건 가입 링크 6종뿐이지만, 테이블은 처음부터 "동아리에서 벌어진 운영 행위"를
-- 담도록 범용화한다 — 도메인마다 감사 테이블을 새로 파면 조회 화면이 테이블 수만큼 늘어난다.
-- 행 기반 유도(코드 행의 created_by/revoked_by·요청 행의 reviewed_by)로도 대부분 추적되지만,
-- 재생성처럼 "무엇이 무엇을 대체했는지"는 행만으로 복원되지 않아 명시적 이벤트를 남긴다.
--
-- append-only: 수정·삭제 경로를 두지 않는다. updated_at·deleted_at 은 BaseEntity 일관성으로만
-- 존재하며 항상 NOW()/NULL 이다(facility_submission_audit 전례).
--
-- 참조 컬럼은 이벤트 종류마다 채워지는 대상이 달라 club_id·actor_user_id 만 NOT NULL 이다.
-- 모집·코드·요청 행은 물리 삭제되지 않으므로(soft delete / 폐기 보존) FK 가 이벤트를 막지 않는다.
CREATE TABLE IF NOT EXISTS club_audit_event (
    id              BIGSERIAL   PRIMARY KEY,
    club_id         BIGINT      NOT NULL REFERENCES club (id),
    event_type      VARCHAR(30) NOT NULL CHECK (event_type IN (
                        'JOIN_LINK_CREATED', 'JOIN_LINK_REGENERATED', 'JOIN_LINK_REVOKED',
                        'JOIN_REQUEST_CREATED', 'JOIN_REQUEST_APPROVED', 'JOIN_REQUEST_REJECTED')),
    actor_user_id   BIGINT      NOT NULL REFERENCES users (id),
    recruitment_id  BIGINT      REFERENCES recruitment (id),
    join_code_id    BIGINT      REFERENCES club_join_code (id),
    join_request_id BIGINT      REFERENCES club_join_request (id),
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP
);

-- 이벤트 종류를 늘릴 때는 이 CHECK 도 함께 갱신해야 한다
-- (ALTER TABLE club_audit_event DROP CONSTRAINT club_audit_event_event_type_check → 새 목록으로 ADD).
-- 감사 테이블이라 애플리케이션 밖(수기 INSERT·백필 스크립트)에서도 값이 들어올 수 있어 DB 에서 막는다.

-- 조회는 동아리 단위 타임라인과 모집 단위 타임라인 두 가지다(조회 UI 는 후속 — 데이터부터 쌓는다).
CREATE INDEX IF NOT EXISTS idx_club_audit_event_club ON club_audit_event (club_id, created_at);
CREATE INDEX IF NOT EXISTS idx_club_audit_event_recruitment ON club_audit_event (recruitment_id, created_at);

-- 누락 시 RowLevelSecurityMigrationTest 가 BUILD FAILED (V97·V98 전례)
ALTER TABLE club_audit_event ENABLE ROW LEVEL SECURITY;
