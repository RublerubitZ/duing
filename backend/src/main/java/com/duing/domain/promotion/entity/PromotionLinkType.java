package com.duing.domain.promotion.entity;

/**
 * Promotion 의 연결 대상 종류. AdminPromotionResponse 가 derive 해서 노출한다.
 * <p>NONE: link_url / notice_id / club_id 모두 null. 클릭 불가 배너.
 * <p>URL: 외부/내부 URL 직접 입력.
 * <p>NOTICE: 공지 연결. 공개 응답에서는 가시성 더블 체크로 isAccessible=false 면 비인터랙티브.
 * <p>CLUB: 동아리 연결.
 */
public enum PromotionLinkType {
    NONE,
    URL,
    NOTICE,
    CLUB
}
