import type {
  AdminGlobalEventDetail,
  CreateGlobalEventPayload,
  GlobalEventCategory,
  UpdateGlobalEventPayload,
} from '@duing/types';

export type GlobalEventFormState = {
  title: string;
  description: string;
  startAt: string;     // datetime-local "YYYY-MM-DDTHH:mm"
  endAt: string;
  location: string;
  linkUrl: string;
  category: GlobalEventCategory | '';
};

export const EMPTY_GLOBAL_EVENT_FORM: GlobalEventFormState = {
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  location: '',
  linkUrl: '',
  category: '',
};

// ISO 8601 → datetime-local (분 단위 절삭, 'YYYY-MM-DDTHH:mm')
const toLocal = (iso: string | null | undefined): string => {
  if (!iso) return '';
  return iso.slice(0, 16);
};

// datetime-local → ISO LocalDateTime (백엔드 LocalDateTime 파싱 가능 형식)
const toLocalDateTime = (local: string): string => `${local}:00`;

export function fromDetail(detail: AdminGlobalEventDetail): GlobalEventFormState {
  return {
    title: detail.title,
    description: detail.description ?? '',
    startAt: toLocal(detail.startAt),
    endAt: toLocal(detail.endAt),
    location: detail.location ?? '',
    linkUrl: detail.linkUrl ?? '',
    category: detail.category,
  };
}

export function toCreatePayload(state: GlobalEventFormState): CreateGlobalEventPayload {
  if (state.category === '') {
    throw new Error('category not selected');
  }
  return {
    title: state.title.trim(),
    description: state.description ? state.description : undefined,
    startAt: toLocalDateTime(state.startAt),
    endAt: toLocalDateTime(state.endAt),
    location: state.location ? state.location : undefined,
    linkUrl: state.linkUrl ? state.linkUrl : undefined,
    category: state.category,
  };
}

/**
 * 폼 상태 → PATCH 요청 payload.
 *
 * 빈 문자열(`""`) 은 의도된 "필드 비우기" 신호로 그대로 백엔드에 전달한다.
 * 백엔드 `GlobalEvent.update` 가 null(=skip) 과 빈 문자열(=clear) 을 구분하므로,
 * `toCreatePayload` 처럼 `'' → undefined` 변환하면 안 됨.
 */
export function toUpdatePayload(state: GlobalEventFormState): UpdateGlobalEventPayload {
  const payload: UpdateGlobalEventPayload = {
    title: state.title.trim(),
    description: state.description,
    startAt: state.startAt ? toLocalDateTime(state.startAt) : undefined,
    endAt: state.endAt ? toLocalDateTime(state.endAt) : undefined,
    location: state.location,
    linkUrl: state.linkUrl,
  };
  if (state.category !== '') payload.category = state.category;
  return payload;
}
