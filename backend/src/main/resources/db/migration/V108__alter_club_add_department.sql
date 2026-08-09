-- club: 단과대 동아리(central_club=false) 의 소속 학과. 자유입력·선택값.
-- 기존 행은 전부 NULL 로 시작한다 — 비중앙 행의 division 잔여값에는 단과대명·분과명이 섞여 있어
-- 학과로 자동 매핑하면 오염된다(2026-08-09 스펙 §3 결정 4).
ALTER TABLE club
    ADD COLUMN IF NOT EXISTS department varchar(50);

COMMENT ON COLUMN club.department IS
    '단과대 동아리의 소속 학과(자유입력). 중앙동아리·미지정은 null.';

-- V33 이 남긴 "학과동아리" 표기를 공식 명칭으로 교체한다.
-- V33 파일 자체는 수정하지 않는다 — Flyway 체크섬이 어긋나면 운영 validate 가 깨진다.
COMMENT ON COLUMN club.college IS
    '단과대 동아리의 소속 단과대학 (user.College enum 코드). 중앙동아리는 null.';
