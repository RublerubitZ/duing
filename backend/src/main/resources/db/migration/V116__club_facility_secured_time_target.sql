-- 동아리별 "기본 확보 시간 대상" 플래그(기본 OFF). 시간 값이 아니라 분류 정책이다 —
-- 크롤 행의 실제 시간 범위를 그대로 쓰고, 이 플래그는 그 행을 BASIC_SECURED_TIME 으로
-- 자동 분류할지만 결정한다(2026-08-27 전면 차단 설계 P4). 분류는 저장하지 않고 조회 시점에 파생한다(P7).
ALTER TABLE club ADD COLUMN facility_secured_time_target BOOLEAN NOT NULL DEFAULT false;

-- 이벤트 종류를 늘릴 때는 CHECK 도 함께 갱신한다(V102 절차 주석, V104·V105 선례).
-- SECURED_TARGET_CHANGED: 총동연이 위 플래그를 변경한 감사 이벤트(detail 에 before/after 스냅샷).
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
    'SECURED_TARGET_CHANGED'));
