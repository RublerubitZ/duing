-- 회비 관리: 동아리별 회비 입금 계좌(fee_account)를 추가한다.
-- 계좌번호는 평문 저장 금지 — 애플리케이션에서 AES-256-GCM 으로 암호화한 base64 문자열(IV||ciphertext+tag)을
-- account_number 에 저장한다(그래서 길이 VARCHAR(255)). bank 코드는 Bank enum 이름과 정확히 일치해야 한다.
-- 신규 테이블은 RLS 를 켠다(V59 정책 준수 — 정책 없음 = 비소유 롤 전면 거부).
CREATE TABLE fee_account (
    id             BIGSERIAL PRIMARY KEY,
    club_id        BIGINT       NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    bank           VARCHAR(30)  NOT NULL CHECK (bank IN (
                       'KB','SHINHAN','WOORI','HANA','NH','IBK','KAKAO','TOSS','SC','BUSAN',
                       'IM','KYONGNAM','GWANGJU','JEONBUK','MG','SHINHYUP','POST','KDB','SUHYUP')),
    account_number VARCHAR(255) NOT NULL,
    account_holder VARCHAR(50)  NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMP WITH TIME ZONE
);
-- 동아리당 활성 계좌 1건(소프트 삭제 행은 제외해 재등록 허용).
CREATE UNIQUE INDEX uk_fee_account_club ON fee_account (club_id) WHERE deleted_at IS NULL;
ALTER TABLE fee_account ENABLE ROW LEVEL SECURITY;
