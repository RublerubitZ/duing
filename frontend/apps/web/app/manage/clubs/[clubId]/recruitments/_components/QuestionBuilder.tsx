'use client';

import type { QuestionItemPayload, QuestionType, RecruitmentQuestionItem } from '@duing/types';

import { FormSegment } from './form-controls';

/** 빌더 내부 상태 — key 는 React 렌더 전용 식별자로 서버가 발급하는 id 와 별개다. */
export type BuilderChoice = { key: string; id: string | null; label: string };
export type BuilderQuestion = {
  key: string;
  id: string | null;
  text: string;
  type: QuestionType;
  required: boolean;
  choices: BuilderChoice[];
};

const MIN_CHOICE_COUNT = 2;

const QUESTION_TYPE_OPTIONS: ReadonlyArray<{ value: QuestionType; label: string }> = [
  { value: 'TEXT', label: '주관식' },
  { value: 'SINGLE_CHOICE', label: '객관식(단일 선택)' },
  { value: 'MULTIPLE_CHOICE', label: '객관식(복수 선택)' },
];

/**
 * 상세 응답 → 빌더 상태. questionItems 부재(구 BE 배포 시차) 시 questions 텍스트로 fallback 한다.
 * 빈 배열([])은 신 BE 의 외부 폼 응답이라 "질문 없음"을 뜻하므로 fallback 대상이 아니다 — undefined 와 구분한다.
 */
export function toBuilderQuestions(
  items: RecruitmentQuestionItem[] | undefined,
  legacyTexts: string[],
  nextKey: () => string,
): BuilderQuestion[] {
  if (items !== undefined) {
    return items.map((item) => ({
      key: nextKey(),
      id: item.id,
      text: item.text,
      type: item.type,
      required: item.required,
      choices: item.choices.map((choice) => ({
        key: nextKey(),
        id: choice.id,
        label: choice.label,
      })),
    }));
  }
  return legacyTexts.map((text) => ({
    key: nextKey(),
    id: null,
    text,
    type: 'TEXT',
    required: true,
    choices: [],
  }));
}

/** 빌더 상태 → 제출 페이로드. TEXT 는 남아 있던 선택지 초안을 버린다(상태에는 유지해 실수 복구 가능). */
export function toQuestionItemsPayload(questions: BuilderQuestion[]): QuestionItemPayload[] {
  return questions.map((question) => ({
    id: question.id,
    text: question.text,
    type: question.type,
    required: question.required,
    choices:
      question.type === 'TEXT'
        ? []
        : question.choices.map((choice) => ({ id: choice.id, label: choice.label })),
  }));
}

type QuestionBuilderProps = {
  questions: BuilderQuestion[];
  onChange: (questions: BuilderQuestion[]) => void;
  nextKey: () => string;
};

export function QuestionBuilder({ questions, onChange, nextKey }: QuestionBuilderProps) {
  function replaceQuestion(targetKey: string, update: (question: BuilderQuestion) => BuilderQuestion) {
    onChange(questions.map((question) => (question.key === targetKey ? update(question) : question)));
  }

  function handleAddQuestion() {
    onChange([
      ...questions,
      { key: nextKey(), id: null, text: '', type: 'TEXT', required: true, choices: [] },
    ]);
  }

  function handleRemoveQuestion(targetKey: string) {
    onChange(questions.filter((question) => question.key !== targetKey));
  }

  function handleChangeText(targetKey: string, text: string) {
    replaceQuestion(targetKey, (question) => ({ ...question, text }));
  }

  function handleChangeType(targetKey: string, type: QuestionType) {
    replaceQuestion(targetKey, (question) => {
      if (type === 'TEXT') {
        // 선택지 초안은 상태에 남겨 유형을 되돌렸을 때 복구할 수 있게 한다.
        return { ...question, type };
      }
      const paddedChoices = question.choices.slice();
      while (paddedChoices.length < MIN_CHOICE_COUNT) {
        paddedChoices.push({ key: nextKey(), id: null, label: '' });
      }
      return { ...question, type, choices: paddedChoices };
    });
  }

  function handleToggleRequired(targetKey: string, required: boolean) {
    replaceQuestion(targetKey, (question) => ({ ...question, required }));
  }

  function handleMoveUp(targetIndex: number) {
    if (targetIndex === 0) return;
    const nextQuestions = questions.slice();
    const upper = nextQuestions[targetIndex - 1];
    const current = nextQuestions[targetIndex];
    if (upper === undefined || current === undefined) return;
    nextQuestions[targetIndex - 1] = current;
    nextQuestions[targetIndex] = upper;
    onChange(nextQuestions);
  }

  function handleMoveDown(targetIndex: number) {
    if (targetIndex === questions.length - 1) return;
    const nextQuestions = questions.slice();
    const lower = nextQuestions[targetIndex + 1];
    const current = nextQuestions[targetIndex];
    if (lower === undefined || current === undefined) return;
    nextQuestions[targetIndex + 1] = current;
    nextQuestions[targetIndex] = lower;
    onChange(nextQuestions);
  }

  function handleAddChoice(targetKey: string) {
    replaceQuestion(targetKey, (question) => ({
      ...question,
      choices: [...question.choices, { key: nextKey(), id: null, label: '' }],
    }));
  }

  function handleRemoveChoice(targetKey: string, choiceKey: string) {
    replaceQuestion(targetKey, (question) => ({
      ...question,
      choices: question.choices.filter((choice) => choice.key !== choiceKey),
    }));
  }

  function handleChangeChoiceLabel(targetKey: string, choiceKey: string, label: string) {
    replaceQuestion(targetKey, (question) => ({
      ...question,
      choices: question.choices.map((choice) =>
        choice.key === choiceKey ? { ...choice, label } : choice,
      ),
    }));
  }

  return (
    <div className="space-y-3">
      {questions.map((question, index) => (
        <div key={question.key} className="rounded-[13px] border border-line bg-paper p-3.5">
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-sm text-charcoal-3">{index + 1}.</span>
            <input
              type="text"
              value={question.text}
              onChange={(event) => handleChangeText(question.key, event.target.value)}
              placeholder={`질문 ${index + 1}을 입력하세요`}
              className="flex-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage"
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                className="grid h-9 w-9 place-items-center rounded text-charcoal-3 hover:bg-graysoft disabled:opacity-30"
                aria-label="위로 이동"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => handleMoveDown(index)}
                disabled={index === questions.length - 1}
                className="grid h-9 w-9 place-items-center rounded text-charcoal-3 hover:bg-graysoft disabled:opacity-30"
                aria-label="아래로 이동"
              >
                ▼
              </button>
              <button
                type="button"
                onClick={() => handleRemoveQuestion(question.key)}
                className="grid h-9 w-9 place-items-center rounded text-coral hover:bg-coral/10"
                aria-label="삭제"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="mt-3 pl-7">
            <FormSegment
              options={QUESTION_TYPE_OPTIONS}
              value={question.type}
              onChange={(type) => handleChangeType(question.key, type)}
              ariaLabel={`질문 ${index + 1} 유형`}
            />

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(event) => handleToggleRequired(question.key, event.target.checked)}
                className="h-4 w-4 rounded border-line accent-ink"
              />
              필수 질문
            </label>

            {question.type !== 'TEXT' && (
              <div className="mt-3 space-y-2">
                {question.choices.map((choice, choiceIndex) => (
                  <div key={choice.key} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={choice.label}
                      onChange={(event) =>
                        handleChangeChoiceLabel(question.key, choice.key, event.target.value)
                      }
                      placeholder={`선택지 ${choiceIndex + 1}`}
                      className="flex-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveChoice(question.key, choice.key)}
                      className="grid h-9 w-9 place-items-center rounded text-coral hover:bg-coral/10"
                      aria-label="선택지 삭제"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {question.choices.length < MIN_CHOICE_COUNT && (
                  <p className="text-xs text-charcoal-3">선택지를 2개 이상 등록해주세요.</p>
                )}
                <button
                  type="button"
                  onClick={() => handleAddChoice(question.key)}
                  className="rounded-md border border-dashed border-line px-3 py-1.5 text-xs text-charcoal-3 hover:border-charcoal-3 hover:text-charcoal"
                >
                  + 선택지 추가
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={handleAddQuestion}
        className="mt-1 rounded-md border border-dashed border-line px-4 py-2 text-sm text-charcoal-3 hover:border-charcoal-3 hover:text-charcoal"
      >
        + 질문 추가
      </button>
    </div>
  );
}
