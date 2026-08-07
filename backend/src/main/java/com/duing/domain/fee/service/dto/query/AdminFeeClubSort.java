package com.duing.domain.fee.service.dto.query;

/** 감사 콘솔 동아리 목록 정렬 기준(스펙 §7.1). 기본은 미수금 많은 순. */
public enum AdminFeeClubSort {
    OUTSTANDING, BILLED, COLLECTED, RECENT_PAYMENT, NAME
}
