-- 회비 안내문: 모집 분야별/신규·기존 회원별 회비 차등 등을 자유 텍스트로 안내 (스펙 2026-08-02-club-fee-note)
ALTER TABLE club ADD COLUMN fee_note VARCHAR(300);
COMMENT ON COLUMN club.fee_note IS '회비 안내문';
