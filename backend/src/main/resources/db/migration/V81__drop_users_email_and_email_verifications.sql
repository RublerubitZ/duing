-- PR5: 학번+MO 인증 전환 완료로 email 은 어디서도 읽거나 쓰지 않는다 (V80 에서 nullable 전환·인증행 TRUNCATE).
-- 안정화 기간을 거쳤으므로 컬럼·테이블을 물리 삭제한다 (spec §9.2·§16 PR5).
DROP INDEX IF EXISTS uk_users_email_active;
ALTER TABLE users DROP COLUMN IF EXISTS email;

DROP TABLE IF EXISTS email_verifications;
