'use client';

import type { QuestionType, RecruitmentQuestionItem } from '@duing/types';

// 리더 지원서 빌더(QuestionBuilder)의 라벨과 동일한 표기를 쓴다 — 편집 화면과 상세 화면이 어긋나지 않도록.
const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  TEXT: '주관식',
  SINGLE_CHOICE: '객관식(단일 선택)',
  MULTIPLE_CHOICE: '객관식(복수 선택)',
};

const BADGE_CLASS = 'rounded-full px-2 py-0.5 text-xs font-medium';

type Props = {
  items: RecruitmentQuestionItem[];
};

export function RecruitmentQuestionItemList({ items }: Props) {
  return (
    <ol className="list-decimal space-y-3 pl-5">
      {items.map((question) => (
        <li key={question.id} className="text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-700">{question.text}</span>
            <span className={`${BADGE_CLASS} bg-slate-100 text-slate-500`}>
              {QUESTION_TYPE_LABEL[question.type]}
            </span>
            <span
              className={
                question.required
                  ? `${BADGE_CLASS} bg-rose-50 text-rose-600`
                  : `${BADGE_CLASS} bg-slate-100 text-slate-500`
              }
            >
              {question.required ? '필수' : '선택'}
            </span>
          </div>
          {question.choices.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-slate-500">
              {question.choices.map((choice) => (
                <li key={choice.id}>{choice.label}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
