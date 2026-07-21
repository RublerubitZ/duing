-- 자동 롤백(deploy-backend.yml — 배포 실패 시 직전 이미지 재기동) 안전망.
--
-- 문제: Flyway 마이그레이션은 롤백되지 않으므로, 새 릴리스가 추가한 컬럼을 모르는 구 이미지가
-- 다시 뜰 수 있다. Hibernate 는 매핑에 없는 컬럼을 INSERT 문에 아예 넣지 않으므로, 그 컬럼이
-- NOT NULL 이면서 DEFAULT 가 없으면 not-null 위반으로 INSERT 가 실패한다. 앱은 healthy 로 뜨기
-- 때문에 해당 기능만 조용히 500 이 된다.
--
-- 아래 세 컬럼은 원 마이그레이션(V85·V37·V39)이 `ADD COLUMN ... NOT NULL DEFAULT x` 직후 같은
-- 파일에서 `DROP DEFAULT` 를 수행해, Expand 와 Contract 를 한 릴리스에 합치면서 이 롤백 창을 열었다.
-- 이 마이그레이션은 Contract 를 되돌려 Expand 상태로 복귀시킨다. Contract(DROP DEFAULT)는 구 이미지
-- 재배포 가능성이 사라진 뒤 별도 릴리스로 미룬다.
--
-- 왜 동작 변화가 없는가 — DEFAULT 는 현행 코드에서 도달 불가하다:
--   * facility_booking.contact_phone — FacilityBooking 생성자가 contactPhone 을 항상 설정하며
--     요청 검증(@NotBlank·@Pattern)이 형식을 보장한다.
--   * application.version / leader_succession_request.version — @Version 컬럼이라 Hibernate 가
--     INSERT 시 항상 값을 채운다.
-- 즉 DEFAULT 는 오직 "컬럼을 모르는 구 이미지가 INSERT 할 때"만 쓰이는 순수 롤백 안전망이다.
-- 값 자체도 원 마이그레이션이 기존 행을 백필할 때 쓴 값과 동일하므로 새로운 의미를 만들지 않는다.
--
-- ALTER COLUMN ... SET DEFAULT 는 테이블 재작성이 없는 메타데이터 변경이라 잠금 시간이 무시할 수준이다.
-- (SET DEFAULT 는 멱등이므로 IF NOT EXISTS 관례 대상이 아니다.)

ALTER TABLE facility_booking
    ALTER COLUMN contact_phone SET DEFAULT '';

ALTER TABLE application
    ALTER COLUMN version SET DEFAULT 0;

ALTER TABLE leader_succession_request
    ALTER COLUMN version SET DEFAULT 0;
