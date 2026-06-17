-- 회비 정책에 자동 월발행 opt-in 컬럼 추가(Sprint 4).
-- auto_issue: 매월 자동 발행 여부(기본 false). issue_day: 발행일, due_day: 마감일(둘 다 1~28).
-- 정합성(ck_fee_policy_auto_issue): 자동발행이 켜진 정책은 MONTHLY + 발행/마감일 1~28 + 마감일 >= 발행일.
-- 1~28 제한으로 말일/달 길이 엣지를 회피한다. issue_day/due_day 는 nullable(auto_issue=false 일 때 무의미).
-- 타입은 INTEGER(엔티티 Integer 필드와 정합, ddl-auto=validate 통과). 값 범위는 CHECK 로 1~28 제한.
ALTER TABLE fee_policy ADD COLUMN auto_issue BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fee_policy ADD COLUMN issue_day  INTEGER;
ALTER TABLE fee_policy ADD COLUMN due_day    INTEGER;
ALTER TABLE fee_policy ADD CONSTRAINT ck_fee_policy_auto_issue CHECK (
    auto_issue = FALSE
    OR (billing_type = 'MONTHLY'
        AND issue_day BETWEEN 1 AND 28
        AND due_day   BETWEEN 1 AND 28
        AND due_day >= issue_day)
);
