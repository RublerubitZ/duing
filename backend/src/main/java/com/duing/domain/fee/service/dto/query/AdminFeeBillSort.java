package com.duing.domain.fee.service.dto.query;

/** 감사 콘솔 청구 정렬(스펙 §7.5). 동률은 id 로 고정해 페이지 간 순서가 흔들리지 않게 한다. */
public enum AdminFeeBillSort {
    /** 최근 발행순(기본). */
    LATEST,
    /** 마감 임박순. */
    DUE,
    /** 청구액 큰 순. */
    AMOUNT
}
