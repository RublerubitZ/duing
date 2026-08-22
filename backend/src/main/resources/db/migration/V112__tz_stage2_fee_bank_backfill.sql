-- 타임존 2단계 1차 백필: KST 벽시계로 저장돼 온 timestamptz 3컬럼의 절대시각 보정 (/TIMEZONE.md 2단계).
-- +9h 왜곡은 prod(JVM=UTC 세션 캐스팅)에만 존재한다 — dev/local(JVM=KST)은 이미 정합이라
-- 백필하면 오히려 -9h 오염된다. 환경 분기는 Flyway placeholder(apply_tz_backfill)로 가드:
--   base/application.yml=false(no-op), application-prod.yml=true.
-- cashbook 의 파생 거래일은 왜곡 시절 UTC 캐스트로 이미 KST 날짜가 맞게 저장돼 있어 보정 불필요.
-- 재실행 금지: 멱등이 아니다(2회 적용 시 -18h). 복원·수동 실행 시 TIMEZONE.md 2단계 5항 참조.
UPDATE payment SET paid_at = paid_at - interval '9 hours' WHERE ${apply_tz_backfill};
UPDATE payment SET voided_at = voided_at - interval '9 hours' WHERE voided_at IS NOT NULL AND ${apply_tz_backfill};
UPDATE bank_transaction SET transaction_at = transaction_at - interval '9 hours' WHERE ${apply_tz_backfill};
