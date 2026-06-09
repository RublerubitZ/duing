'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError } from '@duing/api';
import {
  useCreateInterviewConfigMutation,
  useUpdateInterviewConfigMutation,
} from '@duing/hooks';
import {
  createInterviewConfigSchema,
  updateInterviewConfigSchema,
} from '@duing/schemas';
import type { CreateInterviewConfigInput } from '@duing/schemas';
import type { InterviewConfig } from '@duing/types';

// config 는 페이지가 이미 useInterviewConfigQuery 로 구독해 가져온 결과를 prop 으로 받는다.
// 같은 queryKey 에 다중 observer 가 붙으면 errored state 일 때 retry 루프가 발생할 수 있어
// (TanStack Query v5 의 retryOnMount=true 기본) 단일 구독으로 통일한다.
type Props = {
  recruitmentId: number;
  config: InterviewConfig | null;
};

// datetime-local input 은 `YYYY-MM-DDTHH:mm` (로컬 타임존, 초/Z 없음) 만 허용한다.
// 백엔드 응답은 LocalDateTime(timezone-naive) — `YYYY-MM-DDTHH:mm:ss` 형태이거나
// 과거 데이터로 `Z`/오프셋이 붙어올 수도 있다. 어느 경우든 UTC 변환 없이 앞 16자만 truncate
// 한다 (`new Date(...).toISOString()` 을 거치면 KST 사용자 기준 9시간이 어긋난다).
function toLocalInputValue(value: string | undefined): string {
  if (!value) return '';
  // 'Z' 또는 '+HH:mm'/'-HH:mm' 오프셋을 떼고, 'T' 뒤 시:분만 추출.
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return '';
  return `${match[1]}T${match[2]}:${match[3]}`;
}

// datetime-local 의 로컬시간 문자열을 백엔드 LocalDateTime 포맷으로 직렬화.
// 백엔드는 timezone-naive 이므로 UTC 변환 없이 초만 보충해 그대로 전달한다.
function toBackendDateTime(localValue: string): string {
  return /\d{2}:\d{2}:\d{2}/.test(localValue) ? localValue : `${localValue}:00`;
}

// `<input type="datetime-local" min={...}>` 비교용 — 현재 로컬 시각의 `YYYY-MM-DDTHH:mm`.
// datetime-local 의 min 은 로컬 문자열 비교이므로 UTC 가 아닌 로컬 기준으로 산출해야 한다.
function nowLocalInputValue(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

// 운영진 Step 1 — 면접 설정 생성/수정 섹션.
// config === null 이면 createConfig, 존재하면 updateConfig 로 분기한다.
export function InterviewConfigSection({ recruitmentId, config }: Props) {
  const isEditing = config !== null;

  const { register, handleSubmit, reset, formState } = useForm<CreateInterviewConfigInput>({
    resolver: zodResolver(isEditing ? updateInterviewConfigSchema : createInterviewConfigSchema),
    defaultValues: {
      availabilityDeadline: config ? toLocalInputValue(config.availabilityDeadline) : '',
      location: config?.location ?? '',
    },
  });

  // 서버 응답 도착 후 폼 초기값 동기화. datetime-local 포맷 변환 필요.
  useEffect(() => {
    if (config) {
      reset({
        availabilityDeadline: toLocalInputValue(config.availabilityDeadline),
        location: config.location ?? '',
      });
    }
  }, [config, reset]);

  const createMutation = useCreateInterviewConfigMutation(recruitmentId);
  const updateMutation = useUpdateInterviewConfigMutation(recruitmentId);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const onSubmit = handleSubmit((values) => {
    setSubmitError(null);
    setSubmitSuccess(null);

    const trimmedLocation = values.location?.trim();
    // 빈 입력은 payload 에서 omit — 백엔드에서 "추후 안내" 로 처리됨.
    const payload: { availabilityDeadline: string; location?: string } = {
      availabilityDeadline: toBackendDateTime(values.availabilityDeadline),
    };
    if (trimmedLocation) {
      payload.location = trimmedLocation;
    }

    const handlers = {
      onSuccess: () => {
        setSubmitSuccess(
          isEditing ? '면접 설정이 저장되었습니다.' : '면접 설정이 활성화되었습니다.',
        );
      },
      onError: (mutationError: unknown) => {
        const message =
          mutationError instanceof ApiError
            ? mutationError.message
            : '면접 설정 저장에 실패했습니다.';
        setSubmitError(message);
      },
    };

    if (isEditing) {
      updateMutation.mutate(payload, handlers);
    } else {
      createMutation.mutate(payload, handlers);
    }
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const minLocal = nowLocalInputValue();

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Step 1 · 면접 설정</h2>
        <p className="mt-1 text-xs text-slate-500">
          지원자가 가능 시간대를 제출할 마감 시각과 면접 장소를 입력하세요.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="availability-deadline"
            className="block text-sm font-medium text-slate-700"
          >
            면접 가능시간 제출 마감
          </label>
          <input
            id="availability-deadline"
            type="datetime-local"
            min={minLocal}
            {...register('availabilityDeadline')}
            aria-invalid={formState.errors.availabilityDeadline ? true : undefined}
            aria-describedby={
              formState.errors.availabilityDeadline ? 'availability-deadline-error' : undefined
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          {formState.errors.availabilityDeadline && (
            <p id="availability-deadline-error" className="mt-1 text-xs text-rose-600">
              {formState.errors.availabilityDeadline.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="interview-location"
            className="block text-sm font-medium text-slate-700"
          >
            면접 장소 <span className="text-xs text-slate-400">(선택)</span>
          </label>
          <input
            id="interview-location"
            type="text"
            maxLength={200}
            placeholder="예: 공학관 2201호"
            {...register('location')}
            aria-invalid={formState.errors.location ? true : undefined}
            aria-describedby={
              formState.errors.location ? 'interview-location-error' : 'interview-location-hint'
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p id="interview-location-hint" className="mt-1 text-xs text-slate-500">
            비워두면 추후 안내됩니다.
          </p>
          {formState.errors.location && (
            <p id="interview-location-error" className="mt-1 text-xs text-rose-600">
              {formState.errors.location.message}
            </p>
          )}
        </div>

        {submitError && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {submitError}
          </p>
        )}
        {submitSuccess && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {submitSuccess}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isPending ? '저장 중…' : isEditing ? '저장' : '면접 설정 활성화'}
        </button>
      </form>
    </section>
  );
}
