-- PR2: 로그인·가입이 학번 + 휴대폰 MO 인증으로 전환됨에 따라 email 을 선택 컬럼으로 낮추고,
-- 더 이상 발급·검증되지 않는 이메일 인증 코드 행(raw 이메일 PII)을 비운다.
-- email 컬럼·email_verifications 테이블은 drop 하지 않는다 (구 이미지 롤백 안전, expand/contract).
-- 물리 drop 과 메일 인프라 제거는 PR5 의 후속 마이그레이션에서 수행한다 (spec §9.2·16).
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

TRUNCATE TABLE email_verifications;
