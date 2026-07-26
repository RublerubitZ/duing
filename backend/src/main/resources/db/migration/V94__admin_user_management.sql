-- 계정 상태: ACTIVE(정상) / SUSPENDED(이용 정지). 정지는 로그인·API 접근 차단이며 탈퇴(soft delete)와 별개다.
-- DEFAULT 'ACTIVE' 는 롤백 안전성 — 이 컬럼을 모르는 이전 버전이 붙어도 INSERT 가 깨지지 않는다(V90 전례).
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- 마지막 로그인. 기존 회원은 백필하지 않는다(90일치 auth_event 외에 소스가 없음) — NULL = "기록 없음".
-- naive TIMESTAMP 유지: users 의 다른 시각 컬럼과 같은 규약이어야 하고, users 는 TIMEZONE.md 2단계에서
-- 통째로 timestamptz 로 전환된다. 여기만 앞서가면 로컬(KST)과 prod(UTC)가 다르게 틀린다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- 관리자 내부 메모. 사용자에게 절대 노출되지 않는다(ADMIN 전용 응답에만 포함).
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- 관리자 조치 감사 로그. append-only, 보존기간 없음(auth_event 와 달리 cleanup 잡 대상이 아니다).
-- 개인정보(번호·이름)와 메모 본문은 저장하지 않는다 — 사실 관계만 남기고 값은 users 조인으로 해석한다.
-- updated_at·deleted_at 을 두지 않는다: 수정·삭제가 없는 테이블에 그 컬럼이 있으면 거짓 신호가 된다
-- (phone_verification_events 전례). created_at 은 신규 테이블이라 처음부터 TIMESTAMPTZ 로 둔다.
-- action 에 CHECK 를 걸지 않는다 — 레포의 모든 enum 컬럼과 동일하게 @Enumerated(STRING) 으로 보장한다.
CREATE TABLE admin_user_action_log (
    id             BIGSERIAL PRIMARY KEY,
    actor_user_id  BIGINT      NOT NULL REFERENCES users (id),
    target_user_id BIGINT      NOT NULL REFERENCES users (id),
    action         VARCHAR(40) NOT NULL,
    reason         VARCHAR(500),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_user_action_log_target ON admin_user_action_log (target_user_id, id DESC);

-- 신규 테이블은 RLS 를 반드시 켠다 — RowLevelSecurityMigrationTest 가 public 스키마의 모든 테이블을
-- 검사하므로, 누락하면 이 마이그레이션과 무관해 보이는 테스트가 BUILD FAILED 로 터진다(V92 에서 실제로 겪었다).
ALTER TABLE admin_user_action_log ENABLE ROW LEVEL SECURITY;
