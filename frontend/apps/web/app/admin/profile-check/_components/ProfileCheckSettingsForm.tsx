'use client';

import { useId, useState, type FormEvent } from 'react';

import { ApiError } from '@duing/api';
import { ProfileCheckSemesterChangedError, useUpdateAdminProfileCheckMutation } from '@duing/hooks';
import type { AdminProfileCheck } from '@duing/types';

import { ConsoleCard } from '@/app/admin/_components/ConsoleCard';
import { FormSwitch } from '@/app/_components/FormSwitch';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { formatSemesterLabel } from '@/app/_lib/semesterLabel';
import { ButtonSpinner } from '@/components/loading/Spinner';

const TITLE_MAX_LENGTH = 50;
const MESSAGE_MAX_LENGTH = 300;
const SAVE_FALLBACK_MESSAGE = '저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
const SEMESTER_CHANGED_MESSAGE = '학기가 바뀌어 최신 설정을 다시 불러왔어요. 확인한 뒤 다시 저장해 주세요.';
const FIELD_CLASS =
  'w-full rounded-md border border-line bg-paper px-3.5 py-2 text-[14px] focus-visible:border-ink focus-visible:outline-none';

type SettingsDraft = Partial<Pick<AdminProfileCheck, 'title' | 'message' | 'enabled'>>;

// 400 은 서버 검증 문구, 네트워크·타임아웃은 api 계층이 정규화한 문구를 그대로 쓴다. 5xx 등 나머지와 빈 문구는 폴백.
// 학기가 바뀌었으면 저장하지 않고 최신 설정이 다시 그려졌으니 확인한 뒤 다시 저장하라고 알린다(초안은 남는다).
function saveErrorMessage(error: unknown): string {
  if (error instanceof ProfileCheckSemesterChangedError) {
    return SEMESTER_CHANGED_MESSAGE;
  }
  if (
    error instanceof ApiError &&
    (error.status === 400 || error.code === 'NETWORK' || error.code === 'TIMEOUT')
  ) {
    return error.message.trim() || SAVE_FALLBACK_MESSAGE;
  }
  return SAVE_FALLBACK_MESSAGE;
}

/**
 * 제목·문구·노출 여부 설정. 입력은 서버 값 위에 덮는 초안이다(FacilityOpenDateTab 전례) — 손대지 않은 칸은 늘 서버 값을
 * 보여 주고(다른 운영진이 바꾼 값도 재조회로 따라온다), 저장 버튼은 서버 값과 직접 비교해 바뀐 게 있을 때만 켜진다.
 * 저장 훅이 재조회까지 기다리므로 성공 콜백에서 초안을 비워도 옛 값이 비치지 않는다.
 */
export function ProfileCheckSettingsForm({ profileCheck }: { profileCheck: AdminProfileCheck }) {
  const updateMutation = useUpdateAdminProfileCheckMutation();
  const { addToast } = useToast();
  const [draft, setDraft] = useState<SettingsDraft>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const titleId = useId();
  const titleCountId = useId();
  const messageId = useId();
  const messageCountId = useId();

  const title = draft.title ?? profileCheck.title;
  const message = draft.message ?? profileCheck.message;
  const enabled = draft.enabled ?? profileCheck.enabled;
  const changed =
    title !== profileCheck.title ||
    message !== profileCheck.message ||
    enabled !== profileCheck.enabled;
  const valid = title.trim() !== '' && message.trim() !== '';
  const currentSemesterLabel = formatSemesterLabel(
    profileCheck.currentSemesterYear,
    profileCheck.currentSemesterTerm,
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSaveError(null);
    updateMutation.mutate(
      {
        payload: { title: title.trim(), message: message.trim(), enabled },
        // 노출 여부는 처음 불러온 값일 수 있다 — 학기 경계를 넘겨 열어 둔 화면이면 훅이 저장하지 않는다(스펙 D7).
        expectedSemester: {
          currentSemesterYear: profileCheck.currentSemesterYear,
          currentSemesterTerm: profileCheck.currentSemesterTerm,
        },
      },
      {
        onSuccess: () => {
          setDraft({});
          addToast('저장했어요.');
        },
        onError: (error) => setSaveError(saveErrorMessage(error)),
      },
    );
  };

  return (
    <ConsoleCard className="p-5 sm:p-6">
      <h2 className="mb-4 text-[15px] font-bold text-ink-deep">팝업 설정</h2>
      <form onSubmit={handleSubmit}>
        {/* 저장 중에는 입력·스위치·저장 버튼을 한꺼번에 잠근다 — 성공 때 초안을 비우므로 그사이 입력이 사라지지 않게 한다.
            fieldset 의 기본 min-width(min-content)가 좁은 화면에서 넘치지 않게 min-w-0. */}
        <fieldset disabled={updateMutation.isPending} className="min-w-0 space-y-5">
          <div>
            {/* 스위치(26px)가 터치 44px 에 못 미쳐 행 전체를 label 로 감싼다 — 글자를 눌러도 토글된다. */}
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
              <span className="text-[14px] font-semibold text-ink">사용자에게 보여주기</span>
              <FormSwitch
                checked={enabled}
                onChange={(nextEnabled) => setDraft((current) => ({ ...current, enabled: nextEnabled }))}
                ariaLabel="사용자에게 보여주기"
              />
            </label>
            <p className="text-[12.5px] text-charcoal-2">
              {`켜면 오늘 기준 학기(${currentSemesterLabel})에 적용되고, 학기가 바뀌면 자동으로 꺼져요.`}
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label htmlFor={titleId} className="text-[12.5px] font-semibold text-charcoal-2">
                팝업 제목
              </label>
              {/* 입력을 실제로 끊는 건 maxLength 이고 그건 원문 길이를 본다 — 카운터도 같은 값을 센다. */}
              <span id={titleCountId} className="text-[11px] tabular-nums text-charcoal-2">
                {title.length}/{TITLE_MAX_LENGTH}
              </span>
            </div>
            <input
              id={titleId}
              type="text"
              value={title}
              maxLength={TITLE_MAX_LENGTH}
              aria-describedby={titleCountId}
              onChange={(event) => {
                const nextTitle = event.target.value;
                setDraft((current) => ({ ...current, title: nextTitle }));
              }}
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label htmlFor={messageId} className="text-[12.5px] font-semibold text-charcoal-2">
                안내 문구
              </label>
              <span id={messageCountId} className="text-[11px] tabular-nums text-charcoal-2">
                {message.length}/{MESSAGE_MAX_LENGTH}
              </span>
            </div>
            {/* 줄바꿈은 그대로 사용자 팝업에 보인다(팝업이 텍스트로 그린다). */}
            <textarea
              id={messageId}
              value={message}
              rows={5}
              maxLength={MESSAGE_MAX_LENGTH}
              aria-describedby={messageCountId}
              onChange={(event) => {
                const nextMessage = event.target.value;
                setDraft((current) => ({ ...current, message: nextMessage }));
              }}
              className={FIELD_CLASS}
            />
          </div>

          {saveError && (
            <p
              role="alert"
              className="rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-[13px] text-coral-deep"
            >
              {saveError}
            </p>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={!changed || !valid} className="btn btn-primary">
              {updateMutation.isPending && <ButtonSpinner />}변경사항 저장
            </button>
          </div>
          <span role="status" className="sr-only">
            {updateMutation.isPending ? '설정 저장 중' : null}
          </span>
        </fieldset>
      </form>
    </ConsoleCard>
  );
}
