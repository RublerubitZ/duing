package com.duing.domain.fee.service.dto.query;

import java.time.LocalDate;

/**
 * 거래 동기화 결과 요약.
 *
 * @param fetched       BANK API 가 조회 기간에 반환한 거래 건수
 * @param newlyStored   이번 동기화로 신규 적재된 건수(멱등 충돌로 무시된 건 제외)
 * @param autoMatched   신규 적재 입금 중 자동매칭(Tier 1/2)으로 납부까지 생성된 건수
 * @param pendingReview 신규 적재 입금 중 검토 대기(PENDING) 건수(14일보다 오래돼 자동매칭을 건너뛴 입금 포함)
 * @param missedFrom    조회 상한에 잘려 이번에 불러오지 못한 기간의 첫날(KST), 잘리지 않았으면 null
 * @param missedTo      조회 상한에 잘려 이번에 불러오지 못한 기간의 마지막 날(KST), 잘리지 않았으면 null
 */
public record SyncResult(int fetched, int newlyStored, int autoMatched, int pendingReview,
                         LocalDate missedFrom, LocalDate missedTo) {}
