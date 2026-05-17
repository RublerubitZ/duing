-- users.email / users.student_id 의 full UNIQUE 제약을 partial unique index 로 교체한다.
--
-- 기존 제약(users_email_key, users_student_id_key) 은 soft-delete (deleted_at IS NOT NULL) 행도
-- 차지해 같은 이메일/학번의 재가입을 막는다. Hibernate 의 @SQLRestriction("deleted_at IS NULL") 가
-- 적용된 existsByEmail/findByEmail 은 soft-delete 행을 못 보기 때문에, 애플리케이션은 "중복 없음"
-- 으로 통과시킨 뒤 INSERT 단계에서 DB 제약 충돌(500) 을 일으킨다.
--
-- club_member 가 이미 V7 에서 동일한 partial 인덱스 패턴 (WHERE deleted_at IS NULL) 으로
-- 정의돼 있어 두 도메인의 정책을 일치시킨다.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_student_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uk_users_email_active
    ON users (email)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_users_student_id_active
    ON users (student_id)
    WHERE deleted_at IS NULL;
