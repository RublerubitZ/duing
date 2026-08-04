-- 가입 코드 감사 주체 (스펙 v2 4.1): 생성·폐기를 누가 했는지 코드 행에 남긴다.
-- 사용 내역(요청자·처리자·시각·사유)은 club_join_request 행이 이미 갖고 있어 별도 이벤트 테이블은 두지 않는다.
-- null 허용: 가입 코드는 프로덕션 미출시 기능이라 백필할 기존 행이 없다(dev DB 의 v1 행은 QA 후 정리 전제).
ALTER TABLE club_join_code
    ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users (id),
    ADD COLUMN IF NOT EXISTS revoked_by BIGINT REFERENCES users (id);
