package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 운영진 지원자 목록의 조회 원본 행 — QueryDSL projection 대상.
 * 응답에 실제로 쓰이는 컬럼만 담아 Application·User 엔티티 전체(비밀번호 해시·전화번호 등)를 읽지 않는다.
 *
 * <p>{@code answers} 는 jsonb 원본이라 선택형 답변이 아직 choiceId 다 — 라벨 해석은
 * {@link ApplicantQuery#of} 가 모집의 폼 질문을 받아 수행한다.
 */
public record ApplicantRowQuery(
        Long applicationId,
        ApplicationStatus status,
        LocalDateTime submittedAt,
        List<ApplicationAnswer> answers,
        Long userId,
        String userName,
        String studentId,
        College college,
        String major,
        Grade grade,
        LocalDateTime interviewStartAt,
        Integer myScore
) {}
