-- 시설 대관 신청에 대표 연락처를 추가한다(설계 §1). 관리자·시설 담당자가 예약 관련 연락에 사용한다.
-- NOT NULL DEFAULT '' 로 기존 신청 행을 빈 문자열로 채워 하위호환을 확보한 뒤 DEFAULT 를 제거해,
-- 신규 INSERT 는 값(요청 검증 @NotBlank·@Pattern 이 형식을 보장)을 반드시 명시하게 한다.
ALTER TABLE facility_booking
    ADD COLUMN contact_phone VARCHAR(20) NOT NULL DEFAULT '';

ALTER TABLE facility_booking
    ALTER COLUMN contact_phone DROP DEFAULT;
