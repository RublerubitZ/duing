-- 회비 감사 계측(스펙 §3.1·§4): 회비 참조 4종·변경 스냅샷 컬럼 추가, FEE_* 이벤트 15종 등록.
-- 신규 테이블을 만들지 않는다 — club_audit_event 는 범용 감사 스트림(V102)이며 V104 선례를 따른다.
--
-- 참조 컬럼: 대상 전부 soft delete 라 FK 가 이벤트 보존을 막지 않는다(V104 application_id 와 같은 전제).
-- detail: 변경 전/후 스냅샷(JSONB). id·숫자·enum 만 담고 이름·전화번호·계좌번호는 저장 금지(스펙 §9).
ALTER TABLE club_audit_event ADD COLUMN fee_policy_id BIGINT REFERENCES fee_policy (id);
ALTER TABLE club_audit_event ADD COLUMN fee_bill_id BIGINT REFERENCES fee_bill (id);
ALTER TABLE club_audit_event ADD COLUMN payment_id BIGINT REFERENCES payment (id);
ALTER TABLE club_audit_event ADD COLUMN bank_transaction_id BIGINT REFERENCES bank_transaction (id);
ALTER TABLE club_audit_event ADD COLUMN detail JSONB;

-- 이벤트 종류를 늘릴 때는 CHECK 도 함께 갱신해야 한다(V102 말미 절차 주석, V104 선례).
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
    'FEE_ADMIN_DETAIL_VIEWED', 'FEE_ADMIN_CSV_DOWNLOADED'));

-- 회비 감사 로그 조회(club + 타입 필터 + 기간)용. 기존 (club_id, created_at) 인덱스는 타입 필터에 비효율.
CREATE INDEX idx_club_audit_event_club_type ON club_audit_event (club_id, event_type, created_at);
-- 관리자 목록 '최근 거래일' max 용(스펙 §10 — 기존엔 club_id+status 뿐).
CREATE INDEX idx_bank_tx_club_at ON bank_transaction (club_id, transaction_at);
