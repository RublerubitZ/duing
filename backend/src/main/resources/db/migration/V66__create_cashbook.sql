-- 동아리 회계 장부(금전출납부). 수동 입력 + BANK 거래 자동 생성을 하나의 단식 장부로 통합(C-lite).
CREATE TABLE cashbook_entry (
    id                  BIGSERIAL PRIMARY KEY,
    club_id             BIGINT       NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    entry_type          VARCHAR(10)  NOT NULL,   -- INCOME | EXPENSE
    source              VARCHAR(10)  NOT NULL,   -- MANUAL | BANK_API
    category_code       VARCHAR(20)  NOT NULL,   -- FEE/SPONSOR/SUBSIDY/MT/DINING/SNACK/SUPPLY/MARKETING/OTHER
    custom_category     VARCHAR(40),             -- category_code=OTHER 일 때만
    amount              BIGINT       NOT NULL,
    description         VARCHAR(100) NOT NULL,
    transaction_date    DATE         NOT NULL,
    memo                VARCHAR(200),
    attachment_url      VARCHAR(500),            -- 예약(업로드는 후속)
    bank_transaction_id BIGINT       REFERENCES bank_transaction(id) ON DELETE RESTRICT,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_cashbook_entry_type CHECK (entry_type IN ('INCOME','EXPENSE')),
    CONSTRAINT chk_cashbook_source     CHECK (source IN ('MANUAL','BANK_API')),
    CONSTRAINT chk_cashbook_amount     CHECK (amount > 0),
    CONSTRAINT chk_cashbook_category CHECK (
        (entry_type = 'INCOME'  AND category_code IN ('FEE','SPONSOR','SUBSIDY','OTHER'))
        OR (entry_type = 'EXPENSE' AND category_code IN ('MT','DINING','SNACK','SUPPLY','MARKETING','OTHER'))
    ),
    CONSTRAINT chk_cashbook_custom_category CHECK (custom_category IS NULL OR category_code = 'OTHER'),
    CONSTRAINT chk_cashbook_bank_link CHECK (
        (source = 'BANK_API' AND bank_transaction_id IS NOT NULL)
        OR (source = 'MANUAL' AND bank_transaction_id IS NULL)
    )
);
-- 한 BANK 거래당 장부 1건(재동기화 멱등). 소프트삭제 제외.
CREATE UNIQUE INDEX uk_cashbook_bank_tx ON cashbook_entry (bank_transaction_id)
    WHERE bank_transaction_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_cashbook_club_date ON cashbook_entry (club_id, transaction_date DESC)
    WHERE deleted_at IS NULL;
ALTER TABLE cashbook_entry ENABLE ROW LEVEL SECURITY;

-- 기존에 쌓인 BANK 거래(입금/출금)를 장부로 일괄 백필. 멱등 유니크가 이후 동기화 생성과 충돌을 막는다.
INSERT INTO cashbook_entry (
    club_id, entry_type, source, category_code, custom_category, amount,
    description, transaction_date, memo, attachment_url, bank_transaction_id, created_at, updated_at)
SELECT bt.club_id,
       CASE WHEN bt.transaction_type = 'DEPOSIT' THEN 'INCOME' ELSE 'EXPENSE' END,
       'BANK_API', 'OTHER', NULL, bt.amount,
       COALESCE(NULLIF(bt.counterparty, ''),
                CASE WHEN bt.transaction_type = 'DEPOSIT' THEN '입금' ELSE '출금' END),
       (bt.transaction_at AT TIME ZONE 'Asia/Seoul')::date, NULL, NULL, bt.id, now(), now()
FROM bank_transaction bt
WHERE bt.deleted_at IS NULL
ON CONFLICT (bank_transaction_id) WHERE bank_transaction_id IS NOT NULL AND deleted_at IS NULL DO NOTHING;
