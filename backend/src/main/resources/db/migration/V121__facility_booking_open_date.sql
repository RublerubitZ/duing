-- 시설별 예약 오픈일(총동연 설정). NULL = 아직 열지 않음(신청 불가). 신청 창 [max(오픈일, 오늘), 익월 말일] 은
-- 저장하지 않고 조회 시점에 파생한다(BookingOpenDatePolicy). 학교 목록 동기화(FacilitySyncService.updateDetails)는
-- 이름·위치·순서만 갱신하므로 이 값을 건드리지 않는다 — Facility 엔티티의 @DynamicUpdate 가 그 보장을 SQL 수준으로 고정한다.
-- 백필하지 않는다: 기존 시설도 총동연이 관리자 탭에서 오픈일을 넣기 전까지 닫힌다(릴리스 런북 참조).
ALTER TABLE facility ADD COLUMN booking_open_date DATE NULL;
