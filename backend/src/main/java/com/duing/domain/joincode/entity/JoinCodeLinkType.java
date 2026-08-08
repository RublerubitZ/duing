package com.duing.domain.joincode.entity;

/**
 * 가입 링크의 형태 (V107) — 컬럼이 아니라 {@code recruitment} 귀속 여부에서 파생한다
 * ({@link ClubJoinCode#isClubInvite()}). 저장하지 않는 이유는 두 형태의 구분이 이미 DB
 * {@code ck_club_join_code_link_shape} 로 강제되고 있어, 별도 컬럼을 두면 같은 사실이 두 곳에
 * 적히기 때문이다.
 *
 * <p>화면은 이 값으로 문구를 가른다 — 모집 링크는 "모집 종료 후 N일까지", 초대 링크는 절대 만료 시각.
 */
public enum JoinCodeLinkType {

    /** 외부 폼 모집에 귀속된 합격자 등록용 링크. */
    RECRUITMENT,

    /** 모집과 무관한 동아리 단위의 부원 초대 링크. */
    CLUB_INVITE
}
