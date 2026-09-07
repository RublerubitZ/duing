-- 활동 요일은 DayOfWeek 영문명 CSV 로 저장된다(Club.toActiveDaysCsv). 7일 전부 고르면
-- "MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY" = 56자라 V21 의 VARCHAR(50) 을 넘어
-- 프로필 저장이 DB 제약 위반(409)으로 막혔다(2026-09-07 prod). 도메인 최대값이 들어가도록 넓힌다.
-- varchar 확장은 PostgreSQL 에서 메타데이터 변경뿐이라 테이블 재작성 없이 즉시 끝난다.
ALTER TABLE club ALTER COLUMN active_days TYPE VARCHAR(60);
