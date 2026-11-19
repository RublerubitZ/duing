package com.duing.domain.fee.service.dto.query;

import java.time.LocalDate;

/**
 * 거래 동기화 결과 요약.
 *
 * @param fetched       BANK API 가 조회 기간에 반환한 거래 건수
 * @param newlyStored   이번 동기화로 신규 적재된 건수(멱등 충돌로 무시된 건 제외)
 * @param autoMatched   신규 적재 입금 중 자동매칭(Tier 1/2)으로 납부까지 생성된 건수
 * @param pendingReview 신규 적재 입금 중 검토 대기(PENDING) 건수(14일보다 오래됐거나 직전 마지막 거래보다 앞서 자동매칭을 건너뛴 입금 포함)
 * @param missedFrom    조회 상한에 잘려 이번 동기화에서 확인하지 못한 기간의 첫날(KST) — 마지막 적재 거래일과 마지막 동기화일 가운데
 *                      늦은 날. 그날이 조회 시작보다 앞이 아니면 null(마지막 동기화일은 이 판단에만 쓰고 조회 시작에는 쓰지 않는다).
 *                      이번 동기화가 거래를 적재했거나, 은행 응답을 끝까지 읽고 자동매칭까지 마쳐 기억되면 다음 동기화는 같은 기간을
 *                      다시 돌려주지 않는다. 적재한 거래가 없고 기억도 남지 않았으면
 *                      (적재 롤백, 응답을 끝까지 읽지 못함, 기억 기록 실패, 그 뒤 자동매칭을 껐다 켬) 다시 돌려준다
 * @param missedTo      조회 상한에 잘려 이번 동기화에서 확인하지 못한 기간의 마지막 날(KST), missedFrom 이 null 이면 null
 */
public record SyncResult(int fetched, int newlyStored, int autoMatched, int pendingReview,
                         LocalDate missedFrom, LocalDate missedTo) {}
