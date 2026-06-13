-- 본문 이미지 갤러리(body_image_urls)가 인라인 이미지로 대체되어 더 이상 매핑/사용되지 않으므로 컬럼을 제거한다.
-- (expand-contract: V52 추가 → 코드 사용 제거(V53/E) → 안정화 후 본 마이그레이션에서 DROP)
ALTER TABLE notice DROP COLUMN IF EXISTS body_image_urls;
