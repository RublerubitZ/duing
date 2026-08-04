-- 가입 링크의 절대 만료(7/30/90일)를 "모집 종료 기준 가입 가능 기간" 프리셋으로 대체한다 (스펙 v2 4.3).
-- 기준 시각은 설정 마감일(end_date)이 아니라 실제 종료 시각(recruitment.closed_at) 이다 —
-- 조기 종료·상시모집·기간 연장을 예외 없이 처리하고 "종료 후 N일"이라는 사용자 기대와 일치한다.
--
-- Expand 만 수행한다: expires_at 은 NOT NULL 만 풀고 컬럼은 남긴다. 지금 DROP 하면 배포 실패 후
-- 자동 롤백된 구 이미지가 없는 컬럼을 INSERT 해 500 이 된다. 물리 삭제는 구 이미지 재배포 가능성이
-- 사라진 다음 릴리스에서 단독 Contract 마이그레이션으로 수행한다(MigrationExpandContractGuardTest).
-- 반대로 신 이미지는 expires_at 을 매핑하지 않아 INSERT 에서 빼므로 NOT NULL 해제가 함께 필요하다.
ALTER TABLE club_join_code
    ADD COLUMN IF NOT EXISTS join_window_days SMALLINT NOT NULL DEFAULT 7
        CHECK (join_window_days IN (0, 7, 14));

ALTER TABLE club_join_code
    ALTER COLUMN expires_at DROP NOT NULL;

-- 실제 종료 시각. 모든 종료 전이 경로(수동 마감·새 모집 생성 시 기존 OPEN 마감·동아리 운영 중단
-- 일괄 마감·동아리 폐쇄)에서 스탬프한다. 기존 CLOSED 행은 종료 시각을 알 수 없어 비워 두며,
-- 가입 링크는 미출시 기능이라 영향이 없다 — 스탬프 없는 CLOSED 는 사용 불가로 판정한다(fail-closed).
ALTER TABLE recruitment
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
