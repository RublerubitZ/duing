-- 회원 기수(선택 기능): use_generation 은 UI 표시 제어 전용 설정, generation 은 회원별 기수(미사용 시 NULL 보존).
ALTER TABLE club ADD COLUMN IF NOT EXISTS use_generation BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE club_member ADD COLUMN IF NOT EXISTS generation INTEGER;
