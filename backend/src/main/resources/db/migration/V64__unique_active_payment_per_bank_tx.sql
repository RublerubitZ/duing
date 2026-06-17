-- 한 BANK 거래당 ACTIVE 납부는 최대 1건(중복 결제 DB 백스톱). 매칭취소(VOID) 후 재매칭은 허용(ACTIVE만 대상).
CREATE UNIQUE INDEX uq_payment_active_bank_tx
    ON payment (bank_transaction_id)
    WHERE bank_transaction_id IS NOT NULL AND deleted_at IS NULL AND status = 'ACTIVE';
