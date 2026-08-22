-- V91·V101 이 후속으로 미뤄 둔 죽은 컬럼 4개의 물리 삭제 — Expand 없이 Contract 만 하는 단독 마이그레이션.
-- V91:2 "contact_email / membership_fee / major_projects 는 논리 제거(API 미사용) — 컬럼 drop 은 후속 마이그레이션",
-- V101:5-7 "지금 DROP 하면 배포 실패 후 자동 롤백된 구 이미지가 없는 컬럼을 INSERT 해 500 이 된다.
-- 물리 삭제는 구 이미지 재배포 가능성이 사라진 다음 릴리스에서 단독 Contract 마이그레이션으로 수행한다."
-- 두 약속의 전제인 Expand 릴리스가 모두 prod 에 반영됐다 — Club 3컬럼의 매핑 제거(#1036)는 현 prod 릴리스
-- 5455ffd7 에 포함돼 롤백 대상 이미지부터 이미 매핑이 없고, V101 은 그보다 여러 릴리스 앞이다.
-- 따라서 이 DROP 이 나간 뒤 배포가 실패해 구 이미지로 자동 롤백돼도 네 컬럼을 INSERT 하는 코드가 없다.
-- 이 파일은 ADD COLUMN·CREATE TABLE 을 섞지 않으므로 MigrationExpandContractGuardTest 를 통과한다.
--
-- 네 컬럼에 걸린 제약·인덱스는 없어 부수 삭제가 없다 (마이그레이션 전수 확인): V91 의 chk_club_fee_* 는
-- membership_fee_amount, V107 의 ck_club_join_code_link_shape 는 invite_expires_at 으로 모두 다른 컬럼이고,
-- club_join_code 의 유니크 인덱스 3종은 code·club_id·recruitment_id 기준이다.
-- 죽은 컬럼은 dev/prod 양쪽에 동일하게 존재하므로 V112·V113 백필과 달리 환경 분기 placeholder 가 필요 없다.
ALTER TABLE club DROP COLUMN IF EXISTS contact_email;
ALTER TABLE club DROP COLUMN IF EXISTS membership_fee;
ALTER TABLE club DROP COLUMN IF EXISTS major_projects;
ALTER TABLE club_join_code DROP COLUMN IF EXISTS expires_at;
