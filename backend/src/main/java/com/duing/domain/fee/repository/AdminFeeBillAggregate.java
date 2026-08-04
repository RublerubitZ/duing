package com.duing.domain.fee.repository;

/** 동아리별 청구 집계(CANCELLED 제외). 집계 행이 없는 동아리는 {@link #EMPTY} 로 채운다. */
public record AdminFeeBillAggregate(long billCount, long totalBilled) {

    public static final AdminFeeBillAggregate EMPTY = new AdminFeeBillAggregate(0L, 0L);
}
