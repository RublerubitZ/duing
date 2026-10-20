-- 학기별 정보 확인 팝업 — 1학기 정확도(스펙 2026-10-20-profile-check-term1-accuracy-design §3.1).
-- users.grade_changed_at: 학년이 실제로 바뀐 마지막 시각. 1학기 학년 제안에서 그해 1월 1일(서울) 0시 이후 바꾼 회원을 뺀다 —
--   1~2월에 미리 올린 학년에 3월 팝업이 한 학년을 더 올리라고 권하지 않게.
-- 시각은 TIMESTAMPTZ + 엔티티 Instant(V122·V134 전례) — users 의 나머지 시각(naive 벽시계)과 달리 처음부터 절대시각이다.
-- nullable 추가(Expand-only)라 BE 자동 롤백 시 이전 이미지는 칼럼을 무시한다. 기본값·백필 없음 — null 은 "기록 없음"(지금 동작).
ALTER TABLE users ADD COLUMN IF NOT EXISTS grade_changed_at TIMESTAMP WITH TIME ZONE;
