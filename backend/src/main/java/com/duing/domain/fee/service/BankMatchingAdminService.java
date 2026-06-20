package com.duing.domain.fee.service;

import com.duing.domain.fee.service.dto.query.BankMatchingOverview;

/**
 * 총동연(ADMIN)이 동아리별 BANK 자동매칭을 허용/해제한다.
 *
 * <p><b>원자성(API-first)</b>: 자동매칭을 켜고 끌 때는 외부 BANK API 를 <em>먼저</em> 호출하고,
 * 그 호출이 성공한 경우에만 DB 설정을 변경한다. 외부 호출이 예외를 던지면 메서드가 그 자리에서 종료돼
 * 엔티티 변이가 실행되지 않으므로, DB 상태와 BANK API 상태가 어긋나는(state drift) 일이 없다.
 */
public interface BankMatchingAdminService {

    /**
     * 동아리의 BANK 자동매칭을 허용(active=true)하거나 해제(active=false)한다.
     *
     * <p>적격성 검증(① 회비 계좌 존재, ② 지원 은행)을 통과한 뒤, 외부 BANK API 등록/해제를 먼저 호출하고
     * 성공 시에만 설정 엔티티를 변이한다. 등록 실패(한도 초과·인증 실패 등) 시 예외가 전파되며 DB 는 그대로다.
     */
    void setActive(Long clubId, boolean active);

    /**
     * 자동매칭 관리 화면용 조회. 회비 계좌가 등록된 동아리들의 적격·등록 상태와,
     * 인증 키 전역의 계좌 슬롯 현황을 함께 반환한다.
     */
    BankMatchingOverview getMatchingClubs();

    /**
     * 자동매칭이 실제로 동작 가능한 상태(설정이 active && api_registered 이고 계좌 은행이 지원 대상)인지 반환한다.
     * 예외를 던지지 않는 판정 메서드로, 동기화 가드({@link #requireActiveUsable})와 운영진의 사용 가능 여부
     * 조회가 동일한 기준을 공유하도록 단일 진실 소스 역할을 한다.
     */
    boolean isActiveUsable(Long clubId);

    /**
     * 자동매칭이 실제로 동작 가능한지 검증한다. 설정이 사용 가능(active && api_registered) 상태가 아니거나
     * 계좌 은행이 지원 대상이 아니면 예외를 던진다. 다른 도메인(BE-4 청구 매칭·BE-6 정산)에서 재사용한다.
     */
    void requireActiveUsable(Long clubId);

    /**
     * 회비 계좌 삭제에 앞서 외부 BANK 등록을 정리한다. {@code bank_matching_setting} 행이 존재하면
     * 외부 해제를 best-effort 로 시도하고(실패해도 흡수), 설정을 강제 비활성화한다.
     *
     * <p>외부/복호화 실패로는 <b>예외를 던지지 않는다</b>(흡수) — 계좌 삭제가 외부 장애로 막혀선 안 되기 때문이다.
     * 단, 설정 영속(save) 같은 DB 실패는 트랜잭션과 함께 정상적으로 전파된다.
     * 트리거 기준은 설정의 active 여부가 아니라 행 <em>존재</em> 여부다(active=false·외부 등록 잔존 드리프트까지 정리).
     */
    void unregisterForAccountRemoval(Long clubId);
}
