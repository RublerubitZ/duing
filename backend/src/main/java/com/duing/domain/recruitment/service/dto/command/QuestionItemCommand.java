package com.duing.domain.recruitment.service.dto.command;

import com.duing.domain.recruitment.entity.QuestionType;
import java.util.List;

/**
 * 구조화 질문 명령. id 는 수정 시 왕복용이며 생성 시엔 서버가 무시하고 새로 발급한다 (스펙 §2.2).
 * required 는 요청 DTO 에서 기본값(필수)이 적용된 뒤 넘어오므로 여기서는 원시 boolean 이다.
 */
public record QuestionItemCommand(
        String id, String text, QuestionType type, boolean required, List<ChoiceItemCommand> choices) {

    public QuestionItemCommand {
        choices = choices == null ? List.of() : List.copyOf(choices);
    }

    public record ChoiceItemCommand(String id, String label) {}
}
