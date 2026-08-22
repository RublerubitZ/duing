-- 타임존 2단계 완결 백필: KST 벽시계로 저장돼 온 timestamptz 마지막 1컬럼의 절대시각 보정 (/TIMEZONE.md 2단계).
-- V112(payment 2 + bank_transaction 1)에 이어 ⚠️ 4컬럼이 전부 정정된다 — 저장 코드도 같은 릴리스에서 Instant 로 전환.
-- +9h 왜곡은 prod(JVM=UTC 세션 캐스팅)에만 존재한다 — dev/local(JVM=KST)은 이미 정합이라
-- 백필하면 오히려 -9h 오염된다. 환경 분기는 V112 와 같은 Flyway placeholder(apply_tz_backfill)로 가드:
--   base/test application.yml=false(no-op), application-prod.yml=true.
-- 면접의 나머지 시각(슬롯 start/end·availabilityDeadline)은 Schedule 이라 보정 대상이 아니다.
-- 재실행 금지: 멱등이 아니다(2회 적용 시 -18h). 복원·수동 실행 시 TIMEZONE.md 2단계 5항 참조.
UPDATE interview_round SET assignment_completed_at = assignment_completed_at - interval '9 hours'
WHERE assignment_completed_at IS NOT NULL AND ${apply_tz_backfill};
