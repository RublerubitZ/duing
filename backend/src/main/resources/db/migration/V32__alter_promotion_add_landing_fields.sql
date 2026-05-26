-- promotion: 랜딩 hero 배너 표현 확장
-- - banner_image_url: 이미지 없는 텍스트+배경 배너 허용 → NOT NULL 해제
-- - tag / subtitle / cta_label / emoji: hero 카드 표시 필드(모두 nullable)
-- - palette: 프리셋 색상 코드(필수). 기존 행은 'INK'(어두운 sage 톤) 으로 백필.
ALTER TABLE promotion
    ALTER COLUMN banner_image_url DROP NOT NULL,
    ADD COLUMN tag        VARCHAR(60),
    ADD COLUMN subtitle   VARCHAR(200),
    ADD COLUMN cta_label  VARCHAR(40),
    ADD COLUMN emoji      VARCHAR(8),
    ADD COLUMN palette    VARCHAR(20) NOT NULL DEFAULT 'INK';
