-- 동아리 상세 페이지 노출용 보조 메타데이터 추가.
-- cover_url: 상세 페이지 헤더 이미지
-- tags:      자유 태그 (검색·필터 대상). GIN 인덱스로 다중 태그 IN 조회 최적화
-- sns_links: [{platform, url}] JSONB 배열. 표시 순서는 입력 순서를 따른다.
-- faqs:      [{question, answer, order}] JSONB 배열. 운영진이 UI 에서 통째 갱신.

ALTER TABLE club ADD COLUMN IF NOT EXISTS cover_url  VARCHAR(500);
ALTER TABLE club ADD COLUMN IF NOT EXISTS tags       TEXT[]  NOT NULL DEFAULT '{}';
ALTER TABLE club ADD COLUMN IF NOT EXISTS sns_links  JSONB   NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE club ADD COLUMN IF NOT EXISTS faqs       JSONB   NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_club_tags ON club USING GIN (tags);
