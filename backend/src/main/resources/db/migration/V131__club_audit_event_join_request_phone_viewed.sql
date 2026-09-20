-- 운영진이 가입 요청자의 원본 전화번호를 열람한 이벤트를 남긴다(릴리스 전 P2 1-A). 가입 요청 상세 응답은 이제
-- 마스킹(phoneMasked)만 싣고, 원본은 전용 API(GET /clubs/{clubId}/join-requests/{joinRequestId}/phone)로만 나가며
-- 그 호출이 이 행으로 남는다.
-- JOIN_REQUEST_PHONE_VIEWED: detail {"joinRequestId","userId"}. 열람마다 남긴다(중복 제거 없음). 화면 라벨 "가입 요청자 휴대폰 열람".
-- 지원자 열람(APPLICANT_PHONE_VIEWED, V130)·부원 열람(MEMBER_PHONE_VIEWED, V128)과 종류를 나누는 이유는
-- 대상이 가입 요청이라 참조 키가 다르기 때문이다.
-- 이벤트 종류를 늘릴 때는 CHECK 도 함께 갱신한다(V102 절차 주석, V104·V105·V116·V127·V128·V129·V130 선례).
ALTER TABLE club_audit_event DROP CONSTRAINT club_audit_event_event_type_check;
ALTER TABLE club_audit_event ADD CONSTRAINT club_audit_event_event_type_check CHECK (event_type IN (
    'JOIN_LINK_CREATED', 'JOIN_LINK_REGENERATED', 'JOIN_LINK_REVOKED',
    'JOIN_REQUEST_CREATED', 'JOIN_REQUEST_APPROVED', 'JOIN_REQUEST_REJECTED',
    'RECRUITMENT_FORCE_CLOSED', 'APPLICATION_VIEWED',
    'FEE_POLICY_CREATED', 'FEE_POLICY_UPDATED', 'FEE_POLICY_DELETED',
    'FEE_BILL_ISSUED', 'FEE_BILL_CANCELLED',
    'FEE_PAYMENT_RECORDED', 'FEE_PAYMENT_VOIDED',
    'FEE_TX_MANUAL_MATCHED', 'FEE_TX_IGNORED', 'FEE_TX_UNMATCHED',
    'FEE_ACCOUNT_REGISTERED', 'FEE_ACCOUNT_UPDATED', 'FEE_ACCOUNT_DELETED',
    'FEE_ADMIN_DETAIL_VIEWED', 'FEE_ADMIN_CSV_DOWNLOADED',
    'SECURED_TARGET_CHANGED',
    'CLUB_STATUS_CHANGED', 'CLUB_CLOSED',
    'MEMBER_PHONE_VIEWED', 'MEMBER_LIST_EXPORTED',
    'JOIN_LINK_FORCE_REVOKED',
    'APPLICANT_PHONE_VIEWED',
    'JOIN_REQUEST_PHONE_VIEWED'));
