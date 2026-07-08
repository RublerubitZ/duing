package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;
import java.util.List;

public record ApplicantQuery(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        String email,
        College college,
        String major,
        Grade grade,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime submittedAt,
        LocalDateTime interviewStartAt,
        Integer myScore
) {
    /**
     * interviewStartAt 은 ASSIGNED InterviewSchedule 이 가리키는 슬롯의 startTime 으로
     * QueryDSL repository 에서 직접 채워 넘긴다. ASSIGNED schedule 이 없으면 null.
     * 더 이상 {@code Application.getInterviewAt()} 스칼라 필드를 읽지 않는다.
     */
    public static ApplicantQuery of(Application application,
                                    LocalDateTime interviewStartAt,
                                    Integer myScore) {
        // 질문 라벨 없이 저장된 순서 그대로의 답변 미리보기 — 리더 목록 화면의 경량 프리뷰용이다.
        // TEXT 질문만 존재하는 현재는 answer.values() 가 항상 0~1개라 첫 값(또는 빈 문자열)이
        // 기존 List<String> 응답과 동일한 문자열을 재현한다.
        List<String> answers = application.getAnswers().stream()
                .map(answer -> answer.values().isEmpty() ? "" : answer.values().get(0))
                .toList();
        return new ApplicantQuery(
                application.getId(),
                application.getUser().getId(),
                application.getUser().getName(),
                application.getUser().getStudentId(),
                application.getUser().getEmail(),
                application.getUser().getCollege(),
                application.getUser().getMajor(),
                application.getUser().getGrade(),
                answers,
                application.getStatus(),
                application.getCreatedAt(),
                interviewStartAt,
                myScore
        );
    }
}
