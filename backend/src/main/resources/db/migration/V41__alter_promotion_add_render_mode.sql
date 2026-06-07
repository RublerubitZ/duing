-- promotion: 렌더 모드 + 완성 이미지형용 alt 텍스트.
-- render_mode NOT NULL DEFAULT 'SYSTEM_COMPOSED' 로 기존 row 모두 자동 채워 데이터 영향 zero.
ALTER TABLE promotion
    ADD COLUMN render_mode    VARCHAR(20)  NOT NULL DEFAULT 'SYSTEM_COMPOSED',
    ADD COLUMN image_alt_text VARCHAR(200);

ALTER TABLE promotion
    ADD CONSTRAINT chk_promo_render_mode
    CHECK (render_mode IN ('SYSTEM_COMPOSED','FULL_BLEED_IMAGE'));
