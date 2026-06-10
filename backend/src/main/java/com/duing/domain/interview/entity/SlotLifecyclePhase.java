package com.duing.domain.interview.entity;

/**
 * 면접 슬롯 lifecycle 의 3-phase 정책 상태.
 * <p>
 * Spec: {@code docs/superpowers/specs/2026-06-10-slot-lifecycle-policy-design.md}.
 * Frontend 가 슬롯 관리 UI 매트릭스 (액션 활성/비활성, 안내 문구) 분기를 결정하기 위해
 * {@link com.duing.domain.interview.controller.dto.response.InterviewConfigResponse} 응답에 노출된다.
 */
public enum SlotLifecyclePhase {
    BEFORE_DEADLINE,
    AFTER_DEADLINE_BEFORE_ASSIGNMENT,
    AFTER_ASSIGNMENT
}
