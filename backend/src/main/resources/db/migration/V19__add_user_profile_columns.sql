ALTER TABLE users
    ADD COLUMN grade           VARCHAR(20),
    ADD COLUMN college         VARCHAR(40),
    ADD COLUMN major           VARCHAR(50),
    ADD COLUMN phone           VARCHAR(13),
    ADD COLUMN terms_agreed_at TIMESTAMP;

-- develop 단계 테스트 계정에 백필 (운영 배포 전 별도 backfill 마이그레이션을 추가한다)
UPDATE users
SET grade           = 'FRESHMAN',
    college         = 'IT_ENGINEERING',
    major           = '미설정',
    phone           = '010-0000-0000',
    terms_agreed_at = NOW()
WHERE grade IS NULL;

ALTER TABLE users
    ALTER COLUMN grade SET NOT NULL,
    ALTER COLUMN college SET NOT NULL,
    ALTER COLUMN major SET NOT NULL,
    ALTER COLUMN phone SET NOT NULL,
    ALTER COLUMN terms_agreed_at SET NOT NULL;

ALTER TABLE users
    ADD CONSTRAINT users_phone_format_chk
        CHECK (phone ~ '^010-[0-9]{4}-[0-9]{4}$' OR phone = '010-0000-0000');

CREATE UNIQUE INDEX ux_users_phone
    ON users (phone)
    WHERE deleted_at IS NULL AND phone <> '010-0000-0000';
