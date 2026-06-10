package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import java.time.LocalDateTime;
import java.util.List;

public record MyApplicationDetailQuery(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        List<String> questions,
        List<String> answers,
        ApplicationStatus status,
        AssignedInterviewQuery interview,
        LocalDateTime submittedAt,
        int interviewAvailabilityCount,
        LocalDateTime availabilityDeadline
) {
    /**
     * 면접 진행 필드(가능시간 제출 수 / 배정 면접 / 마감 시각)를 기본값으로 채워 반환한다.
     * 호출자가 신규 필드를 알 필요 없는 경우(단위 테스트 / 면접 미사용 경로)에 사용한다.
     */
    public static MyApplicationDetailQuery from(Application application) {
        return fromAll(application, 0, null, null);
    }

    /**
     * 전체 필드를 포함하는 최종 팩토리 메서드.
     * {@code interview} 는 ASSIGNED 상태 schedule 이 있을 때만 채워지고, 그 외에는 {@code null} 로 전달한다.
     */
    public static MyApplicationDetailQuery fromAll(
            Application application,
            int interviewAvailabilityCount,
            AssignedInterviewQuery interview,
            LocalDateTime availabilityDeadline
    ) {
        var recruitment = application.getRecruitment();
        var club = recruitment.getClub();
        RecruitmentForm form = recruitment.getForm();
        return new MyApplicationDetailQuery(
                application.getId(),
                recruitment.getId(),
                recruitment.getTitle(),
                club.getId(),
                club.getName(),
                form == null ? List.of() : form.getQuestions(),
                application.getAnswers(),
                application.getStatus(),
                interview,
                application.getCreatedAt(),
                interviewAvailabilityCount,
                availabilityDeadline
        );
    }
}
