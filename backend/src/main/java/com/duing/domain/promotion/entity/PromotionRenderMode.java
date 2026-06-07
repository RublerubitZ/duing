package com.duing.domain.promotion.entity;

/**
 * 프로모션 배너 렌더 모드.
 * <p>SYSTEM_COMPOSED: 어드민 입력(제목/부제목/CTA/팔레트/이미지) 을 프론트가 조합해 렌더.
 * <p>FULL_BLEED_IMAGE: 업로드한 이미지만 가공 없이 그대로 노출(시스템 텍스트·그라데이션·팔레트 미사용).
 */
public enum PromotionRenderMode {
    SYSTEM_COMPOSED,
    FULL_BLEED_IMAGE
}
