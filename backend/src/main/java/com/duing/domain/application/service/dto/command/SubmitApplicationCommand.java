package com.duing.domain.application.service.dto.command;

import com.duing.domain.application.exception.ApplicationDomainException;
import java.util.List;

/**
 * 지원 제출 커맨드. 답변 통로는 정확히 하나만 채워진다 (스펙 §2.5).
 * - {@code answers}: 위치 기반 legacy 통로. TODO(legacy-questions-v1): 신 FE 전환 후 제거.
 * - {@code answerItems}: questionId 기반 구조화 통로.
 * <p>
 * 통로 선택으로 질문 유형을 가르지는 않는다 — 어느 통로로 들어오든 값은 동일한 유형별 검증
 * (ApplicationAnswerValidator)을 통과해야 한다. 다만 legacy 통로는 답변을
 * 본문 문자열로 싣기 때문에, 선택형 질문의 값은 choiceId 여야 한다는 규칙에 사실상 걸려 거부된다.
 */
public record SubmitApplicationCommand(
        Long recruitmentId,
        Long userId,
        List<String> answers,
        List<AnswerItem> answerItems
) {
    public SubmitApplicationCommand {
        if (answers != null && answerItems != null) {
            throw new ApplicationDomainException.InvalidAnswerPayloadException(
                    "answers 와 answerItems 는 함께 보낼 수 없습니다.");
        }
        if (answers == null && answerItems == null) {
            throw new ApplicationDomainException.InvalidAnswerPayloadException("답변 목록은 필수 입력값입니다.");
        }
    }

    /** values 의미: TEXT=본문 0~1개, SINGLE_CHOICE=choiceId 0~1개, MULTIPLE_CHOICE=choiceId 목록. */
    public record AnswerItem(String questionId, List<String> values) {}
}
