package com.duing.domain.joincode.entity;

public enum JoinRequestStatus {
    /** 학생이 가입 코드로 요청을 만든 상태 — 이 시점에 코드 사용 인원이 차감된다. 운영진 처리 대기. */
    PENDING,
    /** 운영진 승인 완료 — 확보해 둔 자리로 ClubMember 가 생성된다(승인은 추가 차감하지 않는다). */
    APPROVED,
    /** 운영진 거절 또는 승인 시점 이미 가입된 회원이라 자동 거절된 상태. 차감분은 환급되고 재요청 가능. */
    REJECTED
}
