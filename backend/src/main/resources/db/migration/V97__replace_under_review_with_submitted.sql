-- 지원 FSM 단순화: 서류심사(UNDER_REVIEW) 상태 제거에 따른 값 치환 (스펙 §2).
-- 행 삭제 없음. soft-deleted 행 포함 전체 치환 — enum 역직렬화 안전성 확보.
UPDATE application SET status = 'SUBMITTED' WHERE status = 'UNDER_REVIEW';
UPDATE application_status_history SET previous_status = 'SUBMITTED' WHERE previous_status = 'UNDER_REVIEW';
UPDATE application_status_history SET new_status = 'SUBMITTED' WHERE new_status = 'UNDER_REVIEW';
