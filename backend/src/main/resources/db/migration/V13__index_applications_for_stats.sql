-- Phase 2 운영 콘솔 통계(2.8~2.10) 쿼리 성능 보강.
-- 모집당 지원 행을 (status) 또는 (created_at) 으로 반복 집계하므로
-- recruitment_id 를 선행 컬럼으로 두는 부분 인덱스를 추가한다.
-- soft delete 행은 모든 통계 쿼리에서 제외되므로 partial WHERE 로 인덱스 크기를 줄인다.

-- Summary(상태 분포 카드 5개) + Funnel(상태 그룹 카운트)
CREATE INDEX IF NOT EXISTS idx_application_recruitment_status
    ON application (recruitment_id, status)
    WHERE deleted_at IS NULL;

-- Daily 시계열(일자별 제출 추이): created_at = submitted_at
CREATE INDEX IF NOT EXISTS idx_application_recruitment_created
    ON application (recruitment_id, created_at)
    WHERE deleted_at IS NULL;
