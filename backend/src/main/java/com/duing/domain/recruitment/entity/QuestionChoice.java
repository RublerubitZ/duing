package com.duing.domain.recruitment.entity;

import java.util.UUID;

/** 객관식 선택지. id 는 생성 시 1회 발급되며 수정 시 재생성하지 않는다 (스펙 §2.2). */
public record QuestionChoice(String id, String label) {

    public static QuestionChoice create(String label) {
        return new QuestionChoice(UUID.randomUUID().toString(), label);
    }
}
