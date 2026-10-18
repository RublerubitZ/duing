-- 동아리 로고 썸네일(iOS 깜빡임 P0, 스펙 §4.1). 현재 logo_url 에서 만든 384px 변형의 공개 URL(원본이 이미 작으면 원본 URL),
-- 없으면 NULL — 클라이언트는 NULL 이면 원본을 쓴다. 서버가 로고 변경 커밋 뒤 비동기로 채우고, 기존 로고는 기동 뒤 백필이 채운다.
-- nullable 추가라 롤백 안전(이전 이미지는 컬럼을 무시한다). 기본값 없음.
ALTER TABLE club ADD COLUMN IF NOT EXISTS logo_thumbnail_url VARCHAR(500);
