-- 은행 거래 동기화 — 마지막 동기화 시각 기억(스펙 2026-11-18-bank-sync-last-synced-at-design §3-1).
-- bank_matching_setting.last_synced_at: 은행 응답을 끝까지 읽고 적재까지 커밋한 마지막 동기화가 시작된 시각. 조회 기간·못 본 기간을
--   마지막 거래일과 이 날짜 가운데 늦은 날에서 계산해, 이미 조회한 기간을 다시 경고·재조회하지 않는다. 자동매칭을 끄면 비운다.
-- 시각은 TIMESTAMPTZ + 엔티티 Instant(V135 전례) — 처음부터 절대시각이다.
-- nullable 추가(Expand-only)라 BE 자동 롤백 시 이전 이미지는 칼럼을 무시한다. 기본값·백필 없음 — null 은 "기억 없음"(지금 동작).
ALTER TABLE bank_matching_setting ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;
