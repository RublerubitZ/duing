package com.duing.domain.application.entity;

import java.util.ArrayList;
import java.util.List;

/**
 * 제출된 답변(jsonb 원소). 위치가 아닌 questionId 로 질문을 참조한다.
 * values 의미: TEXT=본문 1개(무응답 시 빈), SINGLE_CHOICE=choiceId 0~1개, MULTIPLE_CHOICE=choiceId 목록.
 * questionId=null 은 V78 마이그레이션의 잉여 답변 보존값으로만 존재하며 표시에서 무시된다 (스펙 §2.4·§2.7).
 */
public record ApplicationAnswer(String questionId, List<String> values) {

    public ApplicationAnswer {
        // null 원소는 빈 문자열(무응답)로 정규화 — 기존 Application.submit 의 #604 정규화를 record 로 이전.
        List<String> sanitized = values == null ? new ArrayList<>() : new ArrayList<>(values);
        sanitized.replaceAll(value -> value == null ? "" : value);
        values = List.copyOf(sanitized);
    }
}
