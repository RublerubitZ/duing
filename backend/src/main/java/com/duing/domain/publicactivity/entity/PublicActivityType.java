package com.duing.domain.publicactivity.entity;

// FE 의 HeroActivityType 과 1:1 계약. enum name 변경/삭제/rename 은 Breaking Change.
// 신규 타입은 뒤에 추가(additive)만 허용한다.
public enum PublicActivityType {
    RECRUIT_OPEN,
    NOTICE_CREATED,
    INTERVIEW_CREATED,
    INTERVIEW_RESULT,
    EVENT_CREATED,
    FEE_OPEN
}
