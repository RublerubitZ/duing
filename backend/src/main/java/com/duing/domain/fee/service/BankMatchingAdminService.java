package com.duing.domain.fee.service;

import com.duing.domain.fee.service.dto.query.BankMatchingOverview;

/**
 * 총동연(ADMIN)이 동아리별 BANK 자동매칭을 허용/해제한다.
 *
 * <p>허용/해제는 <b>외부 부수효과가 없는 로컬 설정 변경</b>이다. BANK API 제공사는 계좌 등록 절차가
 * 없는 무상태 거래조회 API 라서 등록할 대상이 없고, 자동매칭을 쓸 자격은 이 설정으로만 정해진다.
 */
public interface BankMatchingAdminService {

    /**
     * 동아리의 BANK 자동매칭을 허용(active=true)하거나 해제(active=false)한다.
     *
     * <p>적격성 검증(① 회비 계좌 존재, ② 지원 은행)을 통과하면 설정 엔티티를 변이한다.
     * 부적격이면 예외가 전파되며 DB 는 그대로다.
     */
    void setActive(Long clubId, boolean active);

    /**
     * 자동매칭 관리 화면용 조회. 회비 계좌가 등록된 동아리들의 적격·등록 상태와,
     * 자동매칭이 켜진 동아리 수를 함께 반환한다.
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
     * 회비 계좌 삭제에 앞서 자동매칭 설정을 정리한다. {@code bank_matching_setting} 행이 존재하면
     * 비활성화한다 — 계좌가 없어진 동아리는 거래를 조회할 수 없기 때문이다.
     *
     * <p>정리할 외부 등록이 없으므로 이 경로는 외부 장애로 실패하지 않는다.
     * 트리거 기준은 설정의 active 여부가 아니라 행 <em>존재</em> 여부다.
     */
    void unregisterForAccountRemoval(Long clubId);
}
