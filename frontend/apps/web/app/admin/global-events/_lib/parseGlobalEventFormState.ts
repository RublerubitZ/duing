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
  coverImageUrl: string;
  category: GlobalEventCategory | '';
};

export const EMPTY_GLOBAL_EVENT_FORM: GlobalEventFormState = {
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  location: '',
  linkUrl: '',
  coverImageUrl: '',
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
    coverImageUrl: detail.coverImageUrl ?? '',
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
    coverImageUrl: state.coverImageUrl ? state.coverImageUrl : undefined,
    category: state.category,
  };
}

/**
 * 폼 상태 → PATCH 요청 payload.
 *
 * 빈 문자열(`""`) 은 의도된 "필드 비우기" 신호로 그대로 백엔드에 전달한다 (description/location).
 * 백엔드 `GlobalEvent.update` 가 null(=skip) 과 빈 문자열(=clear) 을 구분하므로,
 * `toCreatePayload` 처럼 `'' → undefined` 변환하면 안 됨.
 *
 * **linkUrl 의 빈 문자열 처리 (알려진 한계):**
 * 백엔드 `UpdateGlobalEventRequest.linkUrl` 은 `@Pattern(regexp = "^https?://.+")` 가
 * 빈 문자열을 거부 → `linkUrl: ""` 으로 PATCH 시 400. 현재 본 함수는 그대로 전달하므로
 * 사용자가 linkUrl 을 "지운" 채 저장 시도 시 폼에서 400 에러 노출. 본 PR 범위 밖 — 후속
 * 통합 리팩토링 spec 에서 `clearLinkUrl` 플래그 도입 또는 regex 완화로 통일 예정.
 *
 * coverImageUrl 처리 — `Club.clearCollege` 패턴:
 * - 폼 state.coverImageUrl 이 initialCoverImageUrl 과 동일 → 변경 없음, 두 필드 모두 undefined
 * - state.coverImageUrl 이 새 값 (non-empty, 다름) → coverImageUrl 만 set
 * - state.coverImageUrl 이 '' (제거 의도) → clearCoverImage: true 만 set
 *
 * **Invariant 1 — Mutually exclusive:** coverImageUrl 과 clearCoverImage 는 동시에 set 되지 않는다.
 *
 * **Invariant 2 — initialCoverImageUrl 는 반드시 `''` 로 normalize 된 string.**
 * 백엔드 `AdminGlobalEventDetail.coverImageUrl` 이 `string | null` 이므로 호출자는
 * `detailQuery.data.coverImageUrl ?? ''` 형태로 정규화해 전달해야 한다. `null` 을 그대로
 * 전달하면 `'' !== null` 이라 매 저장마다 잘못된 변경 감지가 일어남.
 */
export function toUpdatePayload(
  state: GlobalEventFormState,
  initialCoverImageUrl: string,
): UpdateGlobalEventPayload {
  const payload: UpdateGlobalEventPayload = {
    title: state.title.trim(),
    description: state.description,
    startAt: state.startAt ? toLocalDateTime(state.startAt) : undefined,
    endAt: state.endAt ? toLocalDateTime(state.endAt) : undefined,
    location: state.location,
    linkUrl: state.linkUrl,
  };
  if (state.category !== '') payload.category = state.category;

  // coverImageUrl 변경 감지 — initial 과 동일하면 둘 다 미설정 (유지).
  if (state.coverImageUrl !== initialCoverImageUrl) {
    if (state.coverImageUrl === '') {
      payload.clearCoverImage = true;
    } else {
      payload.coverImageUrl = state.coverImageUrl;
    }
  }

  return payload;
}
