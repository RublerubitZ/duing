-- 학기별 사용자 정보 확인 팝업(스펙 2026-10-19-semester-profile-check-design §4).
-- profile_check_setting: 총동연 설정 1행(id = 1). 운영진의 첫 저장이 INSERT … ON CONFLICT DO NOTHING 으로 만든다 —
--   시드를 넣지 않는 이유: 통합 테스트가 매 테스트 전 public 테이블을 TRUNCATE 하므로 시드 행은 사라진다.
--   semester_year/term 은 켤 때 기록된 학기(서울 날짜로 자동 판정). 오늘 학기와 다르면 노출이 멈춘다.
-- profile_check_confirmation: (학기, 사용자)당 1행, 삽입 전용. 팝업 확인·프로필 저장·가입이 남긴다.
-- 시각은 TIMESTAMPTZ + 엔티티 Instant(V122 전례) — JVM 존 벽시계를 섞지 않는다.
-- 학년도·학기는 INT(엔티티 Integer/int) — SMALLINT 는 ddl-auto validate 에서 short 매핑을 요구한다.
-- 새 테이블만 만드는 Expand-only 마이그레이션이라 BE 자동 롤백 시 이전 이미지는 두 테이블을 무시한다.
CREATE TABLE IF NOT EXISTS profile_check_setting (
    id            BIGINT       PRIMARY KEY,
    enabled       BOOLEAN      NOT NULL,
    semester_year INT,
    semester_term INT,
    title         VARCHAR(50)  NOT NULL,
    message       VARCHAR(300) NOT NULL,
    created_by    BIGINT       NOT NULL REFERENCES users (id),
    updated_by    BIGINT       NOT NULL REFERENCES users (id),
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT chk_profile_check_setting_single_row CHECK (id = 1),
    CONSTRAINT chk_profile_check_setting_semester_pair CHECK ((semester_year IS NULL) = (semester_term IS NULL)),
    CONSTRAINT chk_profile_check_setting_term CHECK (semester_term IN (1, 2)),
    CONSTRAINT chk_profile_check_setting_enabled_semester CHECK (NOT enabled OR semester_year IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS profile_check_confirmation (
    id            BIGSERIAL    PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES users (id),
    semester_year INT          NOT NULL,
    semester_term INT          NOT NULL,
    confirmed_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT chk_profile_check_confirmation_term CHECK (semester_term IN (1, 2))
);

-- 순서 (학기, 사용자): "이 사람이 이 학기를 확인했나"(3컬럼 등치)와 "이 학기 확인 인원"(접두) 둘 다 이 인덱스로.
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_check_confirmation_semester_user
    ON profile_check_confirmation (semester_year, semester_term, user_id);

-- 앱은 세션 풀러의 단일 롤로 접근하므로 정책 없이 ENABLE 만으로 외부 직접 접근을 차단한다(전 테이블 공통).
ALTER TABLE profile_check_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_check_confirmation ENABLE ROW LEVEL SECURITY;
