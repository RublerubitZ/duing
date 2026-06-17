package com.duing.domain.fee.entity;

/**
 * 회비 계좌의 은행 코드. 한글 표시명은 프론트엔드가 보유하고, 백엔드는 코드만 저장한다.
 * 값 이름은 V61__create_fee_account.sql 의 bank CHECK 제약과 정확히 일치해야 한다.
 */
public enum Bank {
    KB, SHINHAN, WOORI, HANA, NH, IBK, KAKAO, TOSS, SC, BUSAN,
    IM, KYONGNAM, GWANGJU, JEONBUK, MG, SHINHYUP, POST, KDB, SUHYUP
}
