-- 운영시간 기반 예약 병합(§16.1): schedule_dept 꼬리 (H:MM~H:MM)에서 추출한 실제 예약 시간.
-- NULL 이면 운영시간 표기 없음 → 조회 시 SlotMerger(연속 슬롯 병합) 폴백.
ALTER TABLE facility_reservation ADD COLUMN reserved_start_time TIME;
ALTER TABLE facility_reservation ADD COLUMN reserved_end_time TIME;
