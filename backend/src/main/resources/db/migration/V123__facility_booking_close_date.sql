-- 시설별 예약 마감일(총동연 설정). NULL = 상한 없음(익월 말일까지). 신청 창 [max(오픈일, 오늘), min(마감일, 익월 말일)] 은
-- 저장하지 않고 조회 시점에 파생한다(BookingOpenDatePolicy). 학교 목록 동기화는 이 값을 건드리지 않는다(@DynamicUpdate).
ALTER TABLE facility ADD COLUMN booking_close_date DATE NULL;
