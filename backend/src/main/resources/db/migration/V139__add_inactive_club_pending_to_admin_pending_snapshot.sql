-- 총동연 홈 처리 대기 추이에 "운영 중단 미결" 영역 칸을 더한다(스펙 2026-10-30-admin-inactive-club-pending-cleanup-design §4-3).
-- 상수 DEFAULT 라 테이블 재작성 없이 끝난다. 추이 막대는 저장된 total_pending_count 를 쓰므로 이 칸은 영역별 기록이다.
-- Expand-only — 같은 릴리스에서 DEFAULT 를 지우지 않는다. 이전 이미지는 엔티티에 이 칸이 없어 validate 를 통과하고,
-- 이 칸 없이 INSERT 해도 0 이 들어간다(MigrationRollbackSafetyTest).
ALTER TABLE admin_pending_snapshot ADD COLUMN IF NOT EXISTS inactive_club_pending INTEGER NOT NULL DEFAULT 0;
