package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.user.entity.College;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.util.List;

/**
 * 총동연 지원서 상세 — 읽기 전용이며 개인정보·내부 데이터를 최소로만 노출한다.
 *
 * <p>운영진 응답({@code ApplicantDetailResponse})과 같은 쿼리 DTO 에서 만들되 전화번호·학년·평가·면접
 * 정보는 필드 자체를 두지 않는다. 총동연은 심사 주체가 아니므로 심사 내부 자료를 볼 이유가 없고,
 * 상태 이력의 처리자 이름도 담지 않는다(누가 처리했는지는 동아리 내부 정보다).
 */
public record AdminApplicationDetailResponse(
        Long applicationId,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        AdminApplicantProfile applicant,
        ApplicationStatus status,
        Instant submittedAt,
        List<AdminStatusHistoryItem> statusHistory,
        List<AdminQuestionAnswer> answers
) {

    public record AdminApplicantProfile(String name, String studentId, College college, String major) {}

    public record AdminStatusHistoryItem(ApplicationStatus previousStatus, ApplicationStatus newStatus,
                                         Instant changedAt) {}

    public record AdminQuestionAnswer(String question, String answer) {}

    public static AdminApplicationDetailResponse from(ApplicantDetailQuery detailQuery) {
        ApplicantDetailQuery.ApplicantInfoQuery applicantInfo = detailQuery.applicant();
        return new AdminApplicationDetailResponse(
                detailQuery.applicationId(),
                detailQuery.recruitmentId(),
                detailQuery.recruitmentTitle(),
                detailQuery.clubId(),
                detailQuery.clubName(),
                new AdminApplicantProfile(applicantInfo.name(), applicantInfo.studentId(),
                        applicantInfo.college(), applicantInfo.major()),
                detailQuery.status(),
                // 제출·전이 시각은 JPA 감사 필드라 JVM 존 벽시계다(TIMEZONE.md — system regime).
                TimeMapper.systemWallClockToInstant(detailQuery.submittedAt()),
                detailQuery.statusHistory().stream()
                        .map(historyItem -> new AdminStatusHistoryItem(
                                historyItem.previousStatus(),
                                historyItem.newStatus(),
                                TimeMapper.systemWallClockToInstant(historyItem.changedAt())))
                        .toList(),
                detailQuery.answers().stream()
                        .map(questionAnswer -> new AdminQuestionAnswer(
                                questionAnswer.question(), questionAnswer.answer()))
                        .toList()
        );
    }
}
