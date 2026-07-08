'use client';

import type { DraftAnswer, RecruitmentQuestionChoice, RecruitmentQuestionItem } from '@duing/types';

type Props = {
  questions: RecruitmentQuestionItem[];
  answers: DraftAnswer[];
  errors: Record<string, string>;
  onChange: (next: DraftAnswer[]) => void;
  disabled?: boolean;
};

const TEXTAREA_CLASS =
  'w-full resize-y rounded-[12px] border border-[#cfcab8] bg-white px-4 py-3.5 text-sm leading-[1.55] text-charcoal shadow-[0_1px_0_rgba(47,58,46,0.04),_0_1px_2px_rgba(47,58,46,0.05)] transition-[border-color,box-shadow] placeholder:text-[#b8b8ac] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/[.15] disabled:bg-[#f5f3ef] disabled:text-charcoal-3';

const CHOICE_LABEL_CLASS =
  'flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-[#cfcab8] bg-white px-4 py-3 text-sm leading-[1.55] text-charcoal transition-colors hover:border-ink/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-[#f5f3ef] has-[:disabled]:text-charcoal-3';

// 선택형 컨테이너는 tabIndex=-1 로 두어 검증 실패 시 프로그램적으로 포커스를 받을 수 있게 한다
// (개별 radio/checkbox 로 보내면 스크린리더가 그룹 안내와 에러 메시지를 건너뛴다).
const CHOICE_GROUP_CLASS = 'space-y-2 focus:outline-none';

function questionControlId(questionId: string): string {
  return `q-${questionId}`;
}

function questionErrorId(questionId: string): string {
  return `q-${questionId}-error`;
}

function questionLegendId(questionId: string): string {
  return `q-${questionId}-legend`;
}

export function ApplyAnswersStep({
  questions,
  answers,
  errors,
  onChange,
  disabled = false,
}: Props) {
  function valuesOf(questionId: string): string[] {
    return answers.find((answer) => answer.questionId === questionId)?.values ?? [];
  }

  function replaceValues(questionId: string, values: string[]) {
    onChange(
      answers.map((answer) =>
        answer.questionId === questionId ? { questionId, values } : answer,
      ),
    );
  }

  function handleTextChange(questionId: string, text: string) {
    // 백엔드 계약상 TEXT 는 본문 1개이며 무응답은 빈 배열이다.
    replaceValues(questionId, text.length > 0 ? [text] : []);
  }

  function handleSingleChoiceChange(questionId: string, choiceId: string) {
    replaceValues(questionId, [choiceId]);
  }

  function handleMultipleChoiceToggle(
    question: RecruitmentQuestionItem,
    choiceId: string,
    checked: boolean,
  ) {
    const currentValues = valuesOf(question.id);
    // 선택지 정의 순서로 다시 만들어 중복(BE 400)과 순서 흔들림을 원천 차단한다.
    const nextValues = question.choices
      .filter((choice) =>
        choice.id === choiceId ? checked : currentValues.includes(choice.id),
      )
      .map((choice) => choice.id);
    replaceValues(question.id, nextValues);
  }

  if (questions.length === 0) {
    return (
      <p className="text-sm text-charcoal-3">
        이 모집은 별도 질문이 없습니다. 제출 버튼을 눌러 지원할 수 있습니다.
      </p>
    );
  }

  return (
    <div className="space-y-7">
      {questions.map((question, index) => {
        const controlId = questionControlId(question.id);
        const legendId = questionLegendId(question.id);
        const errorMessage = errors[question.id];
        const hasError = errorMessage !== undefined;
        const describedBy = hasError ? questionErrorId(question.id) : undefined;
        const selectedValues = valuesOf(question.id);

        return (
          <fieldset key={question.id} className="space-y-2.5">
            <legend
              id={legendId}
              className="mb-2.5 block text-sm font-semibold tracking-body text-charcoal"
            >
              <span className="mr-1.5 font-mono font-semibold text-ink">{index + 1}.</span>
              {question.text}
              {question.required ? (
                <span aria-hidden="true" className="ml-1 text-coral">
                  *
                </span>
              ) : (
                <span className="ml-2 rounded-full bg-cream-2 px-2 py-0.5 text-[11.5px] font-medium text-charcoal-3">
                  (선택)
                </span>
              )}
            </legend>

            {question.type === 'TEXT' && (
              <textarea
                id={controlId}
                aria-labelledby={legendId}
                aria-required={question.required}
                aria-invalid={hasError}
                aria-describedby={describedBy}
                disabled={disabled}
                value={selectedValues[0] ?? ''}
                onChange={(event) => handleTextChange(question.id, event.target.value)}
                className={TEXTAREA_CLASS}
                style={{ minHeight: '180px' }}
              />
            )}

            {question.type === 'SINGLE_CHOICE' && (
              <div
                id={controlId}
                role="radiogroup"
                tabIndex={-1}
                aria-labelledby={legendId}
                aria-required={question.required}
                aria-invalid={hasError}
                aria-describedby={describedBy}
                className={CHOICE_GROUP_CLASS}
              >
                {question.choices.map((choice: RecruitmentQuestionChoice) => (
                  <label key={choice.id} className={CHOICE_LABEL_CLASS}>
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value={choice.id}
                      checked={selectedValues.includes(choice.id)}
                      disabled={disabled}
                      onChange={() => handleSingleChoiceChange(question.id, choice.id)}
                      className="h-4 w-4 shrink-0 accent-ink"
                    />
                    {choice.label}
                  </label>
                ))}
              </div>
            )}

            {/*
              그룹 의미(role=group)와 이름은 바깥 fieldset/legend 가 이미 제공한다.
              여기에 role="group" 을 또 붙이면 group 이 지원하지 않는 aria-invalid 를 달게 되므로,
              컨테이너는 포커스 타깃 + 에러 연결 역할만 맡는 무role div 로 둔다.
            */}
            {question.type === 'MULTIPLE_CHOICE' && (
              <div
                id={controlId}
                tabIndex={-1}
                aria-invalid={hasError}
                aria-describedby={describedBy}
                className={CHOICE_GROUP_CLASS}
              >
                {question.choices.map((choice: RecruitmentQuestionChoice) => (
                  <label key={choice.id} className={CHOICE_LABEL_CLASS}>
                    <input
                      type="checkbox"
                      name={`question-${question.id}`}
                      value={choice.id}
                      checked={selectedValues.includes(choice.id)}
                      disabled={disabled}
                      onChange={(event) =>
                        handleMultipleChoiceToggle(question, choice.id, event.target.checked)
                      }
                      className="h-4 w-4 shrink-0 rounded accent-ink"
                    />
                    {choice.label}
                  </label>
                ))}
              </div>
            )}

            {hasError && (
              <p id={questionErrorId(question.id)} role="alert" className="text-sm text-coral">
                {errorMessage}
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
