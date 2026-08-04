-- 관리자 모집 조치 감사(스펙 3절): 지원서 참조·사유 컬럼 추가, 이벤트 2종 등록.
-- 신규 테이블을 만들지 않는다 — club_audit_event 는 "동아리에서 벌어진 운영 행위" 전반을 담도록
-- 처음부터 범용화한 스트림이라(V102), 관리자 조치도 같은 테이블에 이벤트 종류만 늘려 수용한다.
--
-- application_id: 지원서 열람 감사(APPLICATION_VIEWED)에서만 채워진다. 지원서는 soft delete 라
-- 물리 삭제가 없어 FK 가 이벤트 보존을 막지 않는다(다른 참조 컬럼과 같은 전제).
-- reason: 강제 마감 사유(RECRUITMENT_FORCE_CLOSED). 선택 입력이라 공백뿐이면 NULL 로 저장한다.
ALTER TABLE club_audit_event ADD COLUMN application_id BIGINT REFERENCES application (id);
ALTER TABLE club_audit_event ADD COLUMN reason VARCHAR(500);

-- 이벤트 종류를 늘릴 때는 CHECK 도 함께 갱신해야 한다(V102 말미 절차 주석).
ALTER TABLE club_audit_event DROP CONSTRAINT club_audit_event_event_type_check;
ALTER TABLE club_audit_event ADD CONSTRAINT club_audit_event_event_type_check CHECK (event_type IN (
    'JOIN_LINK_CREATED', 'JOIN_LINK_REGENERATED', 'JOIN_LINK_REVOKED',
    'JOIN_REQUEST_CREATED', 'JOIN_REQUEST_APPROVED', 'JOIN_REQUEST_REJECTED',
    'RECRUITMENT_FORCE_CLOSED', 'APPLICATION_VIEWED'));
