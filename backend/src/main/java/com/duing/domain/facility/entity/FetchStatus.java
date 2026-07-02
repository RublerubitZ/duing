package com.duing.domain.facility.entity;

/** 월 수집 시도 결과. SUCCESS=전 룸 성공 / PARTIAL=일부 룸 실패 / FAILED=전 룸 실패. */
public enum FetchStatus {
    SUCCESS,
    PARTIAL,
    FAILED
}
