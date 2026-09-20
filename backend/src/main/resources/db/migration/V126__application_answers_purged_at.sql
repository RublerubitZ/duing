-- 지원서 자유서술 답변 파기 마커(docs/superpowers/specs/2026-09-07-application-answer-retention-design.md §2).
-- NULL = 미파기, NOT NULL = PiiRetentionJob 이 보관기간(탈퇴 45일·모집 마감 6개월) 경과로 처리한 시각.
-- DB NOW() 로 기록해 users.anonymized_at 과 같은 regime 이며, 멱등 가드(재UPDATE 방지) 겸 파기 기록이다.
-- 엔티티(Application)에는 매핑하지 않는다 — 잡의 native SQL 만 읽고 쓰고 API 에 노출하지 않는다.
-- nullable·DEFAULT 없음(expand-only)이라 구 이미지·롤백에 안전하다.
ALTER TABLE application ADD COLUMN answers_purged_at TIMESTAMP;
COMMENT ON COLUMN application.answers_purged_at IS '자유서술 답변 파기 시각(PiiRetentionJob). NULL 이면 미파기. 멱등 가드 겸 파기 기록';
