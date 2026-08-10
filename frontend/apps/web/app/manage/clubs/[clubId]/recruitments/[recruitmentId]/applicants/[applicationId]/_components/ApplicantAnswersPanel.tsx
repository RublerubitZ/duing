'use client';

import type { ApplicantDetail } from '@duing/types';

type Props = {
  answers: ApplicantDetail['answers'];
};

export function ApplicantAnswersPanel({ answers }: Props) {
  return (
    <section className="card p-4">
      {/* 빈 상태에서도 h2 를 유지해 좌측 컬럼의 헤딩 구조(지원자 정보 / 응답 / 상태 변경 이력)가 대칭이 되게 한다. */}
      <h2 className="mb-3 text-base font-semibold text-ink">응답</h2>
      {answers.length === 0 ? (
        <p className="text-sm text-charcoal-3">응답이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {answers.map((pair, index) => (
            <div key={pair.question}>
              <p className="text-sm font-medium break-words text-charcoal-2">
                Q{index + 1}. {pair.question}
              </p>
              {/* 답변은 공백 없는 URL·연속 문자열이 올 수 있어 320px 에서 가로 스크롤을 만든다 — break-words 로 가둔다. */}
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-charcoal">
                {pair.answer || '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
