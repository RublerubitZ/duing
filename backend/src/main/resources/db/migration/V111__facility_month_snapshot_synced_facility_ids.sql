-- 예약 크롤이 월 전체 delete+insert 재작성 대신 차등 반영(변경분만 쓰기)으로 바뀌면서,
-- facility_reservation.crawled_at 은 더 이상 "이 세대에 수집됨"의 표식이 될 수 없다
-- (변경 없는 행은 쓰이지 않으므로 옛 세대 시각을 그대로 유지한다).
--
-- 자동 매칭(FacilityBookingMatchingService)의 세대 결박은 "이 시설·월 데이터가 지금 세대 기준으로
-- 최신인가"를 알아야 하므로, 그 판별 근거를 세대 시각(crawled_at)과 같은 행에 함께 기록한다.
-- synced_facility_ids = 이 crawled_at 세대에 수집·영속까지 성공한 시설 id 집합.
-- (fetch 실패·쓰기 실패·데드라인 스킵 시설은 빠지므로 잔존 구세대 행은 fail-closed 로 제외된다.)
--
-- 기본값 '[]' — 마이그레이션 직후에는 어떤 시설도 최신으로 보지 않는다(fail-closed).
-- 다음 크롤 주기(10분)가 집합을 채우면 자동 확정이 정상 재개된다.
ALTER TABLE facility_month_snapshot
    ADD COLUMN synced_facility_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
