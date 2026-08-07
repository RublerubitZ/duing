package com.duing.domain.clubaudit.support;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

/**
 * 감사 detail JSONB 직렬화. 감사 기록은 변이와 같은 트랜잭션이라(스펙 §4) 직렬화 실패를 삼키지 않고
 * 예외로 올려 변이째 롤백시킨다 — 감사 없는 변이를 허용하지 않는다.
 */
public final class AuditDetailJson {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AuditDetailJson() {
    }

    public static String of(Map<String, Object> detail) {
        try {
            return MAPPER.writeValueAsString(detail);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("감사 detail 직렬화 실패", exception);
        }
    }
}
