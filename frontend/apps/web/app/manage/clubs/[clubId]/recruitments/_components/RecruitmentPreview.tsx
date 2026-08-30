'use client';

import type { BuilderQuestion } from './QuestionBuilder';
import { MarkdownProse } from '@/components/markdown/MarkdownProse';
import { recruitmentDaysLeft, recruitmentPeriodLabel } from '@/app/_lib/recruitmentDisplay';

export type RecruitmentPreviewData = {
  title: string;
  startDate: string;
  endDate: string | null;
  capacity: number;
  applicationMode: 'SELF' | 'EXTERNAL';
  externalFormUrl: string;
  useInterview: boolean;
  targetRole: 'MEMBER' | 'OFFICER';
  content: string;
  questions: BuilderQuestion[];
};

function statusPillLabel(data: RecruitmentPreviewData): string {
  if (data.endDate === null) return '상시모집';
  if (!data.startDate || !data.endDate) return '미리보기';
  const daysLeft = recruitmentDaysLeft(data.endDate);
  if (daysLeft === null) return '미리보기';
  return daysLeft >= 0 ? `모집중 · D-${daysLeft}` : '모집마감';
}

/** URL 표시용 — 프로토콜만 제거해 한 줄로. */
function displayUrl(rawUrl: string): string {
  return rawUrl.replace(/^https?:\/\//, '');
}

/**
 * 지원자 시점 미리보기 — 학생 apply 화면과 동일한 순서(모집 정보 → 안내문 → 질문 → 제출).
 * 전부 폼 로컬 상태에서 파생되는 순수 프레젠테이션(쿼리 금지). 인터랙션 없음(장식용).
 */
export function RecruitmentPreview({ data }: { data: RecruitmentPreviewData }) {
  const isExternal = data.applicationMode === 'EXTERNAL';
  const targetLabel = data.targetRole === 'OFFICER' ? '운영진' : '부원';

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 text-xs font-bold tracking-wide text-charcoal-3">
        <span className="h-[7px] w-[7px] rounded-full bg-sage" />
        지원자에게 보이는 지원 화면
      </div>

      <div className="overflow-hidden rounded-[22px] border border-line bg-paper shadow-2">
        {/* 상단 헤더 스트립 */}
        <div className="flex h-16 items-end bg-gradient-to-br from-ink to-ink-soft p-4">
          <span className="rounded-full bg-sage px-2.5 py-1 text-[10.5px] font-bold text-ink-deep">
            {statusPillLabel(data)}
          </span>
        </div>

        <div className="p-[18px]">
          {/* 모집 정보 */}
          <div className="text-[17px] font-extrabold text-ink-deep">
            {data.title || <span className="font-medium text-charcoal-3">모집명을 입력하세요</span>}
          </div>
          <div className="mb-4 mt-1 text-xs text-charcoal-3">
            {recruitmentPeriodLabel(data.startDate || '—', data.endDate)} · 정원 {data.capacity}명 · {targetLabel}
            {data.useInterview ? ' · 면접 진행' : ''}
          </div>

          {/* 안내문 */}
          {data.content && (
            <div className="mb-4">
              <div className="mb-2 text-xs font-bold text-ink-deep">모집 안내</div>
              <MarkdownProse content={data.content} className="text-[12.5px] leading-[1.65]" />
            </div>
          )}

          {isExternal ? (
            <>
              <div className="mb-3 flex items-center gap-2 rounded-[13px] border border-line bg-cream px-3.5 py-3">
                <span className="text-xl">🔗</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold text-ink-deep">외부 폼으로 지원해요</div>
                  <div className="truncate tabular-nums text-[11px] text-charcoal-3">
                    {data.externalFormUrl ? displayUrl(data.externalFormUrl) : '외부 폼 URL을 입력하세요'}
                  </div>
                </div>
              </div>
              <p className="mb-4 text-[11.5px] leading-relaxed text-charcoal-3">
                버튼을 누르면 새 창에서 외부 폼이 열려요. 제출은 해당 폼에서 완료됩니다.
              </p>
              <span className="btn btn-primary pointer-events-none w-full justify-center">지원 폼 열기 →</span>
            </>
          ) : (
            <>
              <div className="mb-3 text-xs font-bold text-ink-deep">지원서 · {data.questions.length}문항</div>
              <div className="mb-4 flex flex-col gap-3.5">
                {data.questions.map((question, index) => (
                  <div key={question.key}>
                    <div className="mb-1.5 text-[12.5px] font-bold leading-snug text-ink-deep">
                      {question.text || (
                        <span className="font-medium text-charcoal-3">질문 {index + 1} (미입력)</span>
                      )}{' '}
                      {question.required && <span className="text-coral">*</span>}
                    </div>
                    {question.type === 'TEXT' ? (
                      <div className="rounded-[10px] border border-line bg-cream px-3 py-2.5 text-xs text-charcoal-3">
                        답변을 입력하세요…
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {question.choices.map((choice, choiceIndex) => (
                          <div
                            key={choice.key}
                            className="flex items-center gap-2 rounded-[10px] border border-line bg-paper px-3 py-2 text-xs text-charcoal-2"
                          >
                            <span
                              className={`h-4 w-4 shrink-0 border-[1.5px] border-line ${
                                question.type === 'MULTIPLE_CHOICE' ? 'rounded-[5px]' : 'rounded-full'
                              }`}
                            />
                            {choice.label || (
                              <span className="text-charcoal-3">선택지 {choiceIndex + 1}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <span className="btn btn-primary pointer-events-none w-full justify-center">제출하기</span>
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-center text-[11.5px] leading-relaxed text-charcoal-3">
        {isExternal ? '외부 폼은 링크 안내만 노출돼요.' : '자체 폼은 지원자가 이 화면에서 바로 작성해요.'}
      </p>
    </div>
  );
}
