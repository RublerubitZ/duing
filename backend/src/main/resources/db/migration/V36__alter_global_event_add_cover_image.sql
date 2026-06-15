-- global_event 에 표지 이미지 URL 컬럼 추가 (optional)
ALTER TABLE global_event
    ADD COLUMN cover_image_url VARCHAR(500);
