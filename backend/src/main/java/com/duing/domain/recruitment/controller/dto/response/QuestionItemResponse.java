package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.QuestionType;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import java.util.List;

/**
 * 모집 상세의 구조화 질문 응답. 지원서 작성 화면이 유형·필수 여부·선택지를 렌더링하고,
 * 제출 시 answerItems 에 실을 questionId / choiceId 를 얻는 유일한 통로다 (스펙 §2.7).
 */
public record QuestionItemResponse(
        String id, String text, QuestionType type, boolean required, List<ChoiceResponse> choices) {

    public record ChoiceResponse(String id, String label) {}

    public static QuestionItemResponse from(RecruitmentQuestion question) {
        return new QuestionItemResponse(
                question.id(), question.text(), question.type(), question.required(),
                question.choices().stream()
                        .map(choice -> new ChoiceResponse(choice.id(), choice.label()))
                        .toList());
    }
}
