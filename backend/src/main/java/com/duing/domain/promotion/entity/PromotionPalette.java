package com.duing.domain.promotion.entity;

/**
 * 랜딩 hero 배너의 색 톤 프리셋.
 * <p>실제 hex(bg/fg/accent) 매핑은 프론트 측 팔레트 테이블에서 관리한다 — 백엔드는 코드만 저장한다.
 */
public enum PromotionPalette {
    INK,
    SAGE,
    WARM,
    CORAL,
    BERRY,
    SKY
}
