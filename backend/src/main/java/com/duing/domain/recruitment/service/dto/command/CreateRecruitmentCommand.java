package com.duing.domain.recruitment.service.dto.command;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.service.ExternalFormUrlValidator;
import java.time.LocalDate;
import java.util.List;

/**
 * 모집 공고 생성 명령. 외부폼/자체폼 분기 검증과 질문 정의 검증을 compact constructor 에서 수행한다.
 * - applicationMode=EXTERNAL: externalFormUrl 필수({@link ExternalFormUrlValidator} 화이트리스트 통과),
 *   questions·안내문(content)은 비어 있어야 하고 면접 진행·지원자 수 공개는 켤 수 없다 (스펙 §2).
 * - applicationMode=SELF: externalFormUrl 은 null 이어야 하며 questions 는 최소 1개.
 * - 유형별 질문 정의(선택형 선택지 2개 이상·주관식 선택지 금지·id/라벨 중복 금지)는
 *   {@link RecruitmentQuestion#validateDefinitions(List)} 가 검사한다.
 *
 * <p>EXTERNAL 제약을 서비스가 아니라 이 compact constructor 에 두는 이유는, 생성 경로가
 * {@code create} 와 {@code replaceActive} 둘인데 두 경로가 모두 이 명령을 받기 때문이다 —
 * 여기 한 곳에 세우면 두 경로가 자동으로 같은 불변식을 갖는다.
 */
public record CreateRecruitmentCommand(
        Long clubId,
        Long currentUserId,
        String title,
        String content,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole,
        List<RecruitmentQuestion> questions,
        LocalDate interviewStartDate,
        LocalDate interviewEndDate,
        boolean showApplicantCount
) {
    public CreateRecruitmentCommand {
        ApplicationMode resolvedMode = applicationMode == null ? ApplicationMode.SELF : applicationMode;
        TargetRole resolvedTargetRole = targetRole == null ? TargetRole.MEMBER : targetRole;
        List<RecruitmentQuestion> resolvedQuestions = questions == null ? List.of() : List.copyOf(questions);

        if (resolvedMode == ApplicationMode.EXTERNAL) {
            if (externalFormUrl == null || externalFormUrl.isBlank()) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "외부 폼 모집은 externalFormUrl 이 필수 입력값입니다.");
            }
            if (!resolvedQuestions.isEmpty()) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "외부 폼 모집에는 questions 를 함께 보낼 수 없습니다.");
            }
            // 지원서를 두잉에서 받지 않으므로 지원 흐름에 딸린 기능도 성립하지 않는다 (스펙 §2).
            // 안내문은 학생 지원 화면 상단에만 노출되는 필드라, 외부 폼으로 나가는 모집에서는 보일 곳이 없다.
            if (useInterview) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "외부 폼 모집은 면접 단계를 사용할 수 없습니다.");
            }
            if (showApplicantCount) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "외부 폼 모집은 지원자 수 공개를 사용할 수 없습니다.");
            }
            if (content != null && !content.isBlank()) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "외부 폼 모집은 안내문을 사용할 수 없습니다.");
            }
            ExternalFormUrlValidator.validate(externalFormUrl);
        } else {
            if (externalFormUrl != null) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "자체 폼 모집은 externalFormUrl 을 지정할 수 없습니다.");
            }
            if (resolvedQuestions.isEmpty()) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "자체 폼 모집은 최소 1개 이상의 질문이 필요합니다.");
            }
        }

        // EXTERNAL 은 위 가드로 항상 빈 리스트라 무해하고, SELF 는 questionItems·legacy questions
        // 어느 통로로 들어왔든 이 지점에서 유형별 의미 검증을 한 번만 통과한다 (생성 경로의 단일 진입점).
        RecruitmentQuestion.validateDefinitions(resolvedQuestions);

        applicationMode = resolvedMode;
        targetRole = resolvedTargetRole;
        questions = resolvedQuestions;
    }
}
