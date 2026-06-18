-- 회비 정책에 청구 대상(target_type) 추가: ALL_MEMBERS(전체 활성 회원, 현행) / SELECTED_MEMBERS(지정 회원만).
-- 기존 정책은 ALL_MEMBERS 로 백필해 현행 동작을 보존한다.
-- 자동발행(auto_issue)은 ALL_MEMBERS 정책만 허용한다 — 선택 회원 명단을 정책에 저장하지 않으므로
-- 크론이 발행 대상을 알 수 없기 때문이다. (기존 chk_fee_policy_auto_issue 는 수정하지 않고 CHECK 를 추가한다.)
-- length=30 은 report.target_type 선례와 동일. 엔티티 @Column(length=30, nullable=false) 와 정합(ddl-auto=validate).
ALTER TABLE fee_policy ADD COLUMN target_type VARCHAR(30) NOT NULL DEFAULT 'ALL_MEMBERS';

ALTER TABLE fee_policy ADD CONSTRAINT chk_fee_policy_target_type
    CHECK (target_type IN ('ALL_MEMBERS', 'SELECTED_MEMBERS'));

ALTER TABLE fee_policy ADD CONSTRAINT chk_fee_policy_auto_issue_all_members
    CHECK (auto_issue = FALSE OR target_type = 'ALL_MEMBERS');
