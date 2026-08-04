-- 지원 FSM 단순화: 서류심사(UNDER_REVIEW) 상태 제거에 따른 값 치환 (스펙 §2).
-- 행 삭제 없음. soft-deleted 행 포함 전체 치환 — enum 역직렬화 안전성 확보.
--
-- 롤백 캐뱃 (배포 헬스 실패 시 이전 이미지로 자동 롤백되지만 이 마이그레이션은 남는다):
-- (a) 신 코드가 ON_HOLD 행을 만든 뒤 롤백하면 구 enum 이 역직렬화하지 못해 500 →
--     롤백 전에 역치환 UPDATE(ON_HOLD → 'SUBMITTED') 를 application·application_status_history 양쪽에 선행.
-- (b) 롤백 창에서 구 코드가 새 UNDER_REVIEW 행을 만들 수 있고 재배포 시 이 파일은 다시 실행되지 않는다 →
--     재배포 전에 아래 UPDATE 3문을 수동으로 재실행(멱등). 방치하면 상수 제거 후 로드 시 500 이 고착된다.
-- (c) 배포 직후에도 application.status 와 application_status_history 의 previous_status·new_status 양 컬럼에
--     UNDER_REVIEW 잔존 행이 0 인지 재확인한다. 한 건이라도 발견되면 아래 UPDATE 3문을 수동 재실행(멱등).
UPDATE application SET status = 'SUBMITTED' WHERE status = 'UNDER_REVIEW';
UPDATE application_status_history SET previous_status = 'SUBMITTED' WHERE previous_status = 'UNDER_REVIEW';
UPDATE application_status_history SET new_status = 'SUBMITTED' WHERE new_status = 'UNDER_REVIEW';
