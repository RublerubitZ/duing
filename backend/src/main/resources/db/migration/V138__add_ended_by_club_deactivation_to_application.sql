-- 운영 중단 동아리 남은 미결 정리(스펙 2026-10-30-admin-inactive-club-pending-cleanup-design §3-2·§4-1).
-- 정리 실행이 불합격으로 바꾼 지원서에만 true 를 남긴다 — 지원자 화면이 "최종 불합격" 대신 "선발 종료"를 보이는 근거.
-- 상수 DEFAULT 라 테이블 재작성 없이 끝난다. 기존 행은 모두 false 가 맞다(정리가 처음 생기는 기능이다).
-- Expand-only — 같은 릴리스에서 DEFAULT 를 지우지 않는다. 이전 이미지는 엔티티에 이 칸이 없어 validate 를 통과하고,
-- 지원서 INSERT 는 이 칸 없이 기본값을 받는다(MigrationRollbackSafetyTest).
ALTER TABLE application ADD COLUMN IF NOT EXISTS ended_by_club_deactivation BOOLEAN NOT NULL DEFAULT false;
