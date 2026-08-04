package com.duing.domain.joincode.entity;

public enum JoinRequestStatus {
    /** 학생이 가입 코드로 요청을 만든 상태. 운영진 처리 대기. */
    PENDING,
    /** 운영진 승인 완료 — 이 시점에 코드 사용 인원이 차감되고 ClubMember 가 생성된다. */
    APPROVED,
    /** 운영진 거절 또는 승인 시점 이미 가입된 회원이라 자동 거절된 상태. 재요청 가능. */
    REJECTED
}
