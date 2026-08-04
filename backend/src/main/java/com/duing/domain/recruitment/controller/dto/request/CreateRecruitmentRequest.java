package com.duing.domain.recruitment.controller.dto.request;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.QuestionChoice;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

/**
 * 모집 공고 생성 요청. 외부 폼 / 자체 폼 분기 검증과 질문 정의의 유형별 의미 검증은
 * {@link CreateRecruitmentCommand} 의 compact constructor 에서 한 번에 수행된다.
 * 본 DTO 는 필드 단위 형식 검증에 더해, questions / questionItems 상호 배타성만
 * 여기서 거부한다 — Command 는 이미 해석된 질문 목록 하나만 받으므로 두 통로의
 * 동시 전송을 Command 에서는 관찰할 수 없기 때문이다 (수정 경로는 서비스에서 거부한다).
 */
public record CreateRecruitmentRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 200, message = "제목은 200자 이하여야 합니다.")
        String title,

        String content,

        @NotNull(message = "모집 시작일은 필수 입력값입니다.")
        LocalDate startDate,

        LocalDate endDate,

        @Min(value = 1, message = "모집 정원은 1명 이상이어야 합니다.")
        int capacity,

        ApplicationMode applicationMode,

        // 스킴·도메인 검증은 Command 의 화이트리스트(ExternalFormUrlValidator)로 옮겼다 — 구 @Pattern 은
        // http 와 임의 도메인을 모두 통과시켰고, EXTERNAL 이 아닐 때만 빈 값을 허용해야 한다는 조건도
        // 필드 단위 제약으로는 표현할 수 없다. 여기 남은 길이 상한은 컬럼 길이 방어다.
        @Size(max = 500, message = "외부 폼 URL 은 500자 이하여야 합니다.")
        String externalFormUrl,

        Boolean useInterview,

        TargetRole targetRole,

        // 질문 개수 상한(50)은 지원서 답변 개수 상한과 반드시 일치해야 한다 — 제출 시
        // answers.size() == questions.size() 를 검증하므로(GeneralApplicationService.validateAnswersAgainstForm),
        // 답변 캡보다 질문 캡이 크면 정상 폼의 제출이 답변 캡에 걸려 막힌다.
        // TODO(legacy-questions-v1): 신 FE 전환 후 제거
        @Size(max = 50, message = "질문은 최대 50개까지 등록할 수 있습니다.")
        List<@NotBlank(message = "질문 항목은 빈 문자열일 수 없습니다.")
                @Size(max = 500, message = "질문은 500자 이하여야 합니다.") String> questions,

        // 구조화 질문(유형·필수 여부·선택지). questions 와 배타적이며, 개수 상한은 questions 와 동일하다.
        // 원소 @NotNull 은 필수다 — @Size 컨테이너 제약은 null 원소를 유효로 간주하므로(Bean Validation 규약)
        // questionItems:[null] 이 toCommand 까지 흘러들어와 NPE(500)가 된다.
        @Size(max = 50, message = "질문은 최대 50개까지 등록할 수 있습니다.")
        List<@NotNull(message = "질문 항목은 비어 있을 수 없습니다.") @Valid QuestionItemPayload> questionItems,

        LocalDate interviewStartDate,

        LocalDate interviewEndDate,

        Boolean showApplicantCount
) {
    public CreateRecruitmentCommand toCommand(Long clubId, Long currentUserId) {
        return new CreateRecruitmentCommand(
                clubId,
                currentUserId,
                title,
                content,
                startDate,
                endDate,
                capacity,
                applicationMode,
                externalFormUrl,
                Boolean.TRUE.equals(useInterview),
                targetRole,
                resolveQuestions(),
                interviewStartDate,
                interviewEndDate,
                Boolean.TRUE.equals(showApplicantCount)
        );
    }

    /**
     * 신·구 질문 필드 해석. 두 필드를 함께 보내면 어느 쪽이 진실인지 알 수 없으므로 거부한다.
     * questionItems 의 클라이언트 id 는 생성 시 무시하고 서버가 새로 발급한다 (스펙 §2.2).
     */
    private List<RecruitmentQuestion> resolveQuestions() {
        if (questions != null && questionItems != null) {
            throw new RecruitmentException.InvalidQuestionDefinitionException(
                    "questions 와 questionItems 는 함께 보낼 수 없습니다.");
        }
        if (questionItems != null) {
            return questionItems.stream()
                    .map(QuestionItemPayload::toCommand)
                    .map(questionItem -> RecruitmentQuestion.create(
                            questionItem.text(),
                            questionItem.type(),
                            questionItem.required(),
                            questionItem.choices().stream()
                                    .map(choice -> QuestionChoice.create(choice.label()))
                                    .toList()))
                    .toList();
        }
        // TODO(legacy-questions-v1): 신 FE 전환 후 제거
        return questions == null ? null : questions.stream().map(RecruitmentQuestion::createText).toList();
    }
}
