package com.duing.domain.club.entity;

/** 대표 연락처(회장 전화) 공개 범위. 기본 PUBLIC — 외부 업체·협찬사가 비로그인으로도 연락 가능하도록. */
public enum ContactVisibility {
    PUBLIC,
    LOGGED_IN_ONLY,
    PRIVATE
}
