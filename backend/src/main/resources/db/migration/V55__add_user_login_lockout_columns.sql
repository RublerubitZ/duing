-- 로그인 무차별 대입(brute-force) 방어용 계정 잠금 상태 컬럼.
-- failed_login_attempts: 연속 로그인 실패 횟수 (로그인 성공·잠금 발동 시 0으로 리셋).
-- locked_until: 이 시각 이전까지 로그인을 차단한다 (NULL = 잠금 아님).
ALTER TABLE users
    ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN locked_until TIMESTAMP;
