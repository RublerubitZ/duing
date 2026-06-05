# GlobalEvent 표지 이미지 첨부

작성일: 2026-06-05
관련 도메인: GlobalEvent (확장)
선행 의존: PR #238 (백엔드), #239 (어드민 UI), #241 (캘린더 통합) 모두 머지 완료

## 배경

캘린더 통합 spec ([`2026-06-05-calendar-integration-design.md`](./2026-06-05-calendar-integration-design.md)) §6 Out of Scope 11 의 후속 작업. 현재 `GlobalEvent` 는 텍스트(title/description/location/linkUrl) 만 지원해 박람회·축제·공연 같은 시각 비중이 큰 행사에서 ADMIN 이 학생에게 행사 분위기를 전달할 수단이 부족하다. 단일 표지 이미지(`coverImageUrl`) 를 optional 필드로 추가해 캘린더 detail 모달에서 노출한다.

URL 직접 입력은 폐지하고 `FileStorageService` + `GlobalEventCoverUploader` 업로드 UX 로 통일한다 (다른 도메인의 URL 입력 패턴 통합 정리는 별도 리팩토링 spec).

## 목표

1. `GlobalEvent` 에 단일 표지 이미지를 등록·교체·삭제할 수 있는 어드민 폼.
2. 캘린더 detail 모달에서 이미지를 노출 (그리드 셀 / 어드민 목록 / 캘린더 카드 응답에는 미포함 — 응답 경량화).
3. 기존 `FileStorageService` + `FilePurpose` enum + `NoticeCoverUploader` 패턴을 그대로 차용해 신규 추상화 없음.

## 변경 범위

본 spec 은 2 PR 로 분리한다:

| PR | 범위 |
|---|---|
| PR 1 (백엔드) | 마이그레이션 + 엔티티 확장 + DTO + API + 테스트 |
| PR 2 (프론트) | 타입/스키마/Uploader 컴포넌트/어드민 폼 wiring/모달 이미지 표시 |

PR 1 머지 후 PR 2 시작.

---

## 1. 백엔드 (PR 1)

### 1.1 마이그레이션 (`V36__alter_global_event_add_cover_image.sql`)

```sql
ALTER TABLE global_event
    ADD COLUMN cover_image_url VARCHAR(500);
```

NULL 허용. 인덱스 추가 없음 (조회 조건으로 사용 안 함).

### 1.2 엔티티 변경 (`GlobalEvent.java`)

- 필드 추가: `@Column(name = "cover_image_url", length = 500) private String coverImageUrl;`
- `@Builder` 생성자 시그니처에 `coverImageUrl` 추가
- 정적 팩토리 `create(...)` 시그니처에 `String coverImageUrl` 추가 (인자 순서: `linkUrl` 다음)
- `update(...)` 시그니처 확장:
  ```java
  public void update(String title, String description,
                     LocalDateTime startAt, LocalDateTime endAt,
                     String location, String linkUrl,
                     GlobalEventCategory category,
                     String coverImageUrl, Boolean clearCoverImage) {
      // ... 기존 partial update 로직
      if (Boolean.TRUE.equals(clearCoverImage)) {
          this.coverImageUrl = null;
      } else if (coverImageUrl != null) {
          this.coverImageUrl = coverImageUrl;
      }
      // clearCoverImage != true && coverImageUrl == null → 기존 값 유지
  }
  ```

### 1.3 PATCH semantics (`Club.clearCollege` 패턴 차용)

Java record 는 JSON 의 `null` 과 필드 누락을 둘 다 `null` 로 deserialize 하므로 둘을 구분하려면 별도 플래그가 필요. 본 도메인은 기존 `Club` 의 `clearCollege` 패턴을 그대로 따른다.

| 클라이언트 요청 | 처리 |
|---|---|
| `coverImageUrl` 누락 + `clearCoverImage` 누락 | 기존 값 유지 |
| `coverImageUrl: "https://..."` | 새 URL 로 교체 |
| `clearCoverImage: true` (값 무관) | `null` 로 제거 |
| `coverImageUrl: "..."` + `clearCoverImage: true` | 제거 우선 (`clearCoverImage` 가 먼저 평가됨) |

이 규칙은 `update()` 메서드 내부 if 순서로 강제된다.

### 1.4 DTO 변경

**Request:**

`CreateGlobalEventRequest`:
```java
@Size(max = 500, message = "이미지 URL 은 500자 이하여야 합니다.")
String coverImageUrl
```
- optional (`@NotNull` 없음). 비어 있어도 생성 가능.
- `@Pattern` 적용하지 않음 — Supabase Storage URL 은 다양한 호스트 형태 가능.

`UpdateGlobalEventRequest`:
```java
@Size(max = 500, message = "이미지 URL 은 500자 이하여야 합니다.")
String coverImageUrl,
Boolean clearCoverImage
```

**Response:**

`GlobalEventDetailResponse` (공개 GE-2):
```java
public record GlobalEventDetailResponse(
        ..., String linkUrl,
        String coverImageUrl,                    // 추가
        GlobalEventCategory category
) { ... }
```

`AdminGlobalEventDetailResponse` (어드민 GE-4): 동일 위치에 `coverImageUrl` 추가.

**손대지 않는 응답:**

- `GlobalEventCardResponse` (공개 GE-1 윈도우 조회)
- `AdminGlobalEventSummaryResponse` (어드민 GE-3 페이지네이션 목록)

**이유 (응답 경량화):** 캘린더 윈도우 조회는 한 달 기준 수십~수백 카드 반환 가능. 카드마다 ~500B 의 URL 필드는 누적 시 응답 크기 + JSON 직렬화 비용 부담. 카드는 그리드 셀 pill 만 렌더하므로 이미지 미사용. 사용자가 카드 클릭 시 별도 `GET /global-events/{id}` 로 detail lazy fetch 하는 흐름이 이미 구현돼 있어 이미지는 그때 같이 받으면 충분.

### 1.5 `FilePurpose` enum 확장

`com.duing.global.file.controller.dto.FilePurpose` 에 한 줄 추가:

```java
public enum FilePurpose {
    LOGO("club/logo"),
    COVER("club/cover"),
    PHOTO("club/photo"),
    NOTICE_COVER("notice/cover"),
    PROMOTION_BANNER("promotion/banner"),
    GLOBAL_EVENT_COVER("global-event/cover");  // 추가
    ...
}
```

업로드는 기존 `POST /api/v1/files?purpose=GLOBAL_EVENT_COVER` 엔드포인트 그대로 사용. 신규 컨트롤러/서비스 없음.

### 1.6 Acceptance Test 추가 케이스

`GlobalEventAcceptanceTest` 에 다음 케이스 추가:

1. **`createWithCoverImage`** — coverImageUrl 을 가진 이벤트 생성 → 공개 detail 응답에 포함되는지 확인.
2. **`updateClearCoverImage`** — 이미지가 있는 이벤트에 `clearCoverImage: true` PATCH → detail 응답에서 `coverImageUrl: null` 확인.
3. **`updatePartialPreservesCoverImage`** — 이미지가 있는 이벤트에 title 만 PATCH → coverImageUrl 유지되는지 확인.

기존 3 가지 검증 케이스(title 공백 / endAt<startAt / linkUrl 패턴 / category null) 는 그대로 유지.

### 1.7 파일 변경 (PR 1)

```
backend/src/main/resources/db/migration/
└── V36__alter_global_event_add_cover_image.sql       [신규]

backend/src/main/java/com/duing/domain/globalevent/
├── entity/GlobalEvent.java                            [수정] coverImageUrl 필드 + update 시그니처
├── controller/dto/request/CreateGlobalEventRequest.java  [수정] coverImageUrl 필드
├── controller/dto/request/UpdateGlobalEventRequest.java  [수정] coverImageUrl + clearCoverImage 필드
├── controller/dto/response/GlobalEventDetailResponse.java       [수정] coverImageUrl 필드
├── controller/dto/response/AdminGlobalEventDetailResponse.java  [수정] coverImageUrl 필드
├── service/dto/command/CreateGlobalEventCommand.java  [수정] coverImageUrl 필드
└── service/dto/command/UpdateGlobalEventCommand.java  [수정] coverImageUrl + clearCoverImage 필드

backend/src/main/java/com/duing/global/file/controller/dto/
└── FilePurpose.java                                   [수정] GLOBAL_EVENT_COVER 추가

backend/src/test/java/com/duing/domain/globalevent/
└── GlobalEventAcceptanceTest.java                     [수정] 3 케이스 추가
```

---

## 2. 프론트엔드 (PR 2)

### 2.1 타입 확장 (`packages/types/src/globalEvent.ts`)

```ts
export type GlobalEventDetail = {
  ...,
  linkUrl: string | null;
  coverImageUrl: string | null;       // 추가
  category: GlobalEventCategory;
};

export type AdminGlobalEventDetail = {
  ...,
  linkUrl: string | null;
  coverImageUrl: string | null;       // 추가
  category: GlobalEventCategory;
  ...
};

export type CreateGlobalEventPayload = {
  ...,
  linkUrl?: string;
  coverImageUrl?: string;             // 추가
  category: GlobalEventCategory;
};

export type UpdateGlobalEventPayload = Partial<CreateGlobalEventPayload> & {
  clearCoverImage?: boolean;          // 추가
};
```

**Card/Summary 타입은 손대지 않음** — 백엔드와 정합.

### 2.2 zod 스키마 (`packages/schemas/src/index.ts`)

```ts
// createGlobalEventSchema 안:
coverImageUrl: z.string().max(500).optional().or(z.literal('')),

// updateGlobalEventSchema 안:
coverImageUrl: z.string().max(500).optional().or(z.literal('')),
clearCoverImage: z.boolean().optional(),
```

`@Pattern` 미적용 (백엔드와 일치).

### 2.3 API 클라이언트 (변경 없음)

`client.admin.globalEvents.create/update` 의 payload 타입이 `CreateGlobalEventPayload` / `UpdateGlobalEventPayload` 라 자동 반영. 추가 메서드 없음.

### 2.4 폼 상태 파서 (`parseGlobalEventFormState.ts`)

```ts
export type GlobalEventFormState = {
  ...,
  linkUrl: string;
  coverImageUrl: string;              // 추가
  category: GlobalEventCategory | '';
};

export const EMPTY_GLOBAL_EVENT_FORM: GlobalEventFormState = {
  ...,
  coverImageUrl: '',
  ...
};

export function fromDetail(detail: AdminGlobalEventDetail): GlobalEventFormState {
  return {
    ...,
    coverImageUrl: detail.coverImageUrl ?? '',
    ...
  };
}

export function toCreatePayload(state: GlobalEventFormState): CreateGlobalEventPayload {
  return {
    ...,
    coverImageUrl: state.coverImageUrl ? state.coverImageUrl : undefined,
    ...
  };
}

/**
 * 폼 상태 → PATCH payload.
 *
 * coverImageUrl 처리:
 * - 폼에서 이미지 그대로 두면 (initial 과 동일) `coverImageUrl: undefined`, `clearCoverImage: undefined` → 백엔드 유지
 * - 새 이미지 업로드 → `coverImageUrl: '<url>'`, `clearCoverImage: undefined` → 백엔드 교체
 * - "제거" 버튼 → state.coverImageUrl = '' → toUpdatePayload 가 감지하고 `clearCoverImage: true` 설정
 *
 * initialCoverImageUrl 을 비교해 변경 감지 — Edit 페이지가 initialState 와 함께 전달.
 */
export function toUpdatePayload(
  state: GlobalEventFormState,
  initialCoverImageUrl: string,
): UpdateGlobalEventPayload {
  const payload: UpdateGlobalEventPayload = { ... 기존 필드 };

  if (state.coverImageUrl !== initialCoverImageUrl) {
    if (state.coverImageUrl === '') {
      // 사용자가 "제거" 한 경우
      payload.clearCoverImage = true;
    } else {
      // 새 이미지 업로드
      payload.coverImageUrl = state.coverImageUrl;
    }
  }
  // 변경 없음 → coverImageUrl, clearCoverImage 둘 다 undefined

  return payload;
}
```

`toUpdatePayload` 가 `initialCoverImageUrl: string` 두 번째 인자를 받도록 시그니처 확장. `AdminGlobalEventEditPage` 가 detail fetch 후 initial 값을 함께 전달.

**Invariant — `coverImageUrl` 과 `clearCoverImage` 는 동시에 set 되지 않는다.** 두 필드는 if/else 분기 안에서 mutually exclusive — `state.coverImageUrl !== ''` 면 `coverImageUrl` 만 set, `state.coverImageUrl === ''` 면 `clearCoverImage: true` 만 set. 둘 다 set 된 payload 는 생성될 수 없다. 백엔드 `update()` 의 `clearCoverImage` 우선 평가 로직 (§1.3) 과 합쳐 이중 보호.

### 2.5 `GlobalEventCoverUploader` 컴포넌트 (신규)

`apps/web/app/admin/global-events/_components/GlobalEventCoverUploader.tsx`:

`NoticeCoverUploader` 의 **거의 그대로 복제** — `purpose` 만 `'GLOBAL_EVENT_COVER'` 로 변경, alt 텍스트 "표지 이미지" 로 변경.

```tsx
'use client';

import { useRef } from 'react';
import { useFileUploadMutation } from '@duing/hooks';

type Props = {
  value: string;
  onChange: (url: string) => void;
};

export function GlobalEventCoverUploader({ value, onChange }: Props) {
  const uploadMutation = useFileUploadMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = async (file: File) => {
    const result = await uploadMutation.mutateAsync({ file, purpose: 'GLOBAL_EVENT_COVER' });
    onChange(result.url);
  };

  return (
    <div className="space-y-2">
      <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-graysoft border border-line">
        {value ? (
          <img src={value} alt="표지 이미지" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-charcoal-3 text-[13px]">
            표지 이미지를 업로드하세요 (선택)
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
               onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleSelect(file); }} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}
                className="px-3 py-1.5 rounded-md bg-paper border border-line text-[13px] font-semibold hover:border-ink disabled:opacity-50">
          {uploadMutation.isPending ? '업로드 중…' : value ? '교체' : '업로드'}
        </button>
        {value && (
          <button type="button" onClick={() => onChange('')}
                  className="px-3 py-1.5 rounded-md text-[13px] text-charcoal-2 hover:bg-graysoft">
            제거
          </button>
        )}
      </div>
      {uploadMutation.isError && (
        <p className="text-red-500 text-[12px]">업로드 실패. 다시 시도해주세요.</p>
      )}
    </div>
  );
}
```

`Notice` 의 별도 컴포넌트로 두는 이유는 도메인별 alt 텍스트 / placeholder 카피 차이 + 향후 도메인별 정책(예: aspect ratio 조정) 다르게 갈 여지를 남기기 위함.

### 2.6 `AdminGlobalEventForm` wiring

폼 안의 `category` select 위 또는 첫 필드로 `<Field label="표지 이미지">` 추가 — `<GlobalEventCoverUploader value={state.coverImageUrl} onChange={(url) => update('coverImageUrl', url)} />`.

**URL 직접 입력 텍스트 input 은 노출하지 않음.** 사용자는 업로드/교체/제거 버튼만 인지하며, URL 문자열은 비공개. DB/API 의 `coverImageUrl` 필드는 Supabase Storage URL 저장 용도로 유지.

`Edit` 페이지의 `toUpdatePayload` 호출부:

```tsx
updateMutation.mutate(
  {
    eventId,
    payload: toUpdatePayload(state, detailQuery.data.coverImageUrl ?? ''),
  },
  { ... },
);
```

### 2.7 `EventDetailModal` 의 `GlobalDetailSection` — 이미지 렌더

PR3 머지본 (`apps/web/app/calendar/_components/EventDetailModal.tsx`) 의 `GlobalDetailSection` 안에서, description 위에 이미지 렌더:

```tsx
return (
  <div className="space-y-3 border-t border-line pt-4">
    {detail.coverImageUrl && (
      <div className="aspect-[16/9] rounded-lg overflow-hidden bg-graysoft">
        <img
          src={detail.coverImageUrl}
          alt={`${...title 정보가 있다면 활용...}`}
          className="w-full h-full object-cover"
        />
      </div>
    )}
    {detail.description && (
      <p className="text-[13.5px] text-charcoal whitespace-pre-wrap">{detail.description}</p>
    )}
    {detail.linkUrl && (
      <a href={detail.linkUrl} target="_blank" rel="noreferrer noopener" ...>
        자세히 보기 ↗
      </a>
    )}
  </div>
);
```

이미지 없으면 영역 자체 안 그림. `next/image` 대신 `<img>` — Supabase Storage URL 은 외부라 lint 의 `no-img-element` 는 기존 `NoticeCoverUploader` 와 동일하게 eslint-disable-next-line.

### 2.8 파일 변경 (PR 2)

```
frontend/packages/types/src/
└── globalEvent.ts                                     [수정] coverImageUrl + clearCoverImage 추가

frontend/packages/schemas/src/
└── index.ts                                           [수정] create/updateGlobalEventSchema 에 추가

frontend/apps/web/app/admin/global-events/
├── _lib/parseGlobalEventFormState.ts                  [수정] coverImageUrl 필드 + toUpdatePayload 시그니처 확장
├── _components/AdminGlobalEventForm.tsx               [수정] Uploader 추가
├── _components/GlobalEventCoverUploader.tsx           [신규]
└── _pages/AdminGlobalEventEditPage.tsx                [수정] toUpdatePayload 호출 시 initialCoverImageUrl 전달

frontend/apps/web/app/calendar/_components/
└── EventDetailModal.tsx                               [수정] GlobalDetailSection 에 이미지 렌더
```

---

## 3. 테스트 / 검증

### 3.1 백엔드 (PR 1)

Acceptance test 3 케이스 추가 (§1.6). 기존 케이스는 그대로.

### 3.2 프론트엔드 (PR 2)

수동 시나리오:

1. **새 GlobalEvent 등록 (이미지 포함)** — ADMIN 이 폼에서 이미지 업로드 → 등록 → 공개 캘린더 detail 모달에서 이미지 노출 확인.
2. **새 GlobalEvent 등록 (이미지 미포함)** — Uploader 비워둔 채 등록 → 모달에서 이미지 영역 자체 안 그림 (description / linkUrl 만).
3. **수정 (이미지 교체)** — 기존 이미지 있는 이벤트에서 "교체" → 새 URL 저장 → 모달 갱신 확인. (`clearCoverImage` 미전송, `coverImageUrl` 만 전송)
4. **수정 (이미지 제거)** — "제거" 버튼 → 폼 state '' → PATCH 페이로드에 `clearCoverImage: true` 포함 → 백엔드 null 저장 → 모달에서 이미지 영역 사라짐.
5. **수정 (이미지 그대로, title 만 변경)** — title 만 수정 → PATCH 페이로드에 `coverImageUrl`/`clearCoverImage` 둘 다 누락 → 백엔드 기존 값 유지.
6. **카드 응답 무영향** — 어드민 목록(GE-3) / 공개 캘린더 윈도우(GE-1) 응답에 `coverImageUrl` 필드 없음 확인 (네트워크 탭).
7. **빌드** — `pnpm lint && pnpm typecheck && pnpm build` PASS.

---

## 4. 에러 처리

| 상황 | 처리 |
|---|---|
| 업로드 mutation 실패 (네트워크/스토리지 에러) | `GlobalEventCoverUploader` 자체 에러 메시지 ("업로드 실패. 다시 시도해주세요.") |
| 업로드 파일이 비-이미지 / 과용량 | `accept="image/*"` 는 UX 힌트 — 보안 강제력 없음. 백엔드 검증 부재로 일단 통과 가능. **§5 Out of Scope 6 (업로드 형식/용량 정책)** 에서 통합 리팩토링 시 차단. MVP 는 운영 신뢰. |
| 등록 검증 실패 (`coverImageUrl` > 500자) | 폼 zod refine 또는 백엔드 400 fallback |
| 모달에서 이미지 로드 실패 (Storage URL 만료/삭제) | `<img>` 의 onerror 별도 처리 X — 깨진 이미지 아이콘 노출. MVP 수용. **§5 Out of Scope 7 (`<ImageWithFallback>` 공통 컴포넌트)** 에서 도메인 일괄 처리 예정. |
| `clearCoverImage: true` 가 잘못된 타이밍에 전송 | 백엔드는 멱등적 처리 (null 인 row 에 다시 null 적용해도 무해) |

---

## 5. Out of Scope

이번 spec 에서 다루지 않음 — 후속 PR/spec 후보:

1. **Storage orphan 파일 정리** — 이미지 교체/삭제 시 기존 Supabase Storage 파일이 그대로 남아 누적됨. `FileStorageService.delete()` 호출 타이밍 (commit 후) 과 transaction rollback 정합 문제 때문에 안전한 즉시 삭제는 단순하지 않음. 별도 cleanup job 또는 outbox 패턴 필요. **MVP 는 orphan 수용.** → §5.후속 통합 리팩토링 spec.

2. **다중 이미지 갤러리** — 박람회 포스터 + 부스 배치도 + 행사 사진 같이 여러 장 첨부. `global_event_image` 별도 테이블 + N:1 FK + display_order 필요. 운영 demand 누적 시.

3. **캘린더 그리드 셀 / 어드민 목록 썸네일** — 카드 응답 경량화 정책 (§1.4) 과 충돌. 카드 응답 분리 (목록용 lite vs 상세 fetch) 정책 자체를 바꾸는 별도 결정 필요.

4. **카테고리별 조건부 필수** — FAIR/FESTIVAL 은 필수, APPLICATION 은 선택 같은 로직. zod superRefine + 백엔드 카테고리 분기 필요. 운영 정책 확정 후.

5. **이미지 alt 텍스트 별도 필드** — 접근성 강화용 `coverImageAlt`. 현재는 행사 title 재사용으로 충분.

6. **업로드 형식/용량 검증 정책** — 허용 확장자(jpg/jpeg/png/webp) 화이트리스트 + 최대 용량 (예: 5MB) 의 백엔드 검증. 본 spec 의 frontend `accept="image/*"` 는 UX 힌트일 뿐 보안 강제력 없음. 백엔드 측은 현재 검증 없음. GlobalEvent 만 적용하면 다른 도메인(Notice/Promotion)과 정책 불일치 발생 — **`FileController` / `FileStorageService` 레벨의 공통 검증**으로 가야 의미. → §5.후속 통합 리팩토링 spec.

7. **이미지 로드 실패 fallback UI** — `EventDetailModal` 에서 `<img>` onError 시 깨진 아이콘 대신 "이미지를 불러올 수 없습니다" fallback. GlobalEvent 한 곳만 처리하면 Notice/Promotion 모달은 그대로 깨진 아이콘 — UI 일관성 안 됨. **`<ImageWithFallback>` 공통 컴포넌트**를 만들어 도메인 일괄 적용해야 의미. → §5.후속 통합 리팩토링 spec.

8. **이미지 리사이즈 / 압축 / WebP 변환** — `FileStorageService` 자체 책임으로 미루기. Supabase Storage 의 transformations 옵션 도입 시.

9. **다른 도메인 (Notice / Promotion / Banner) 의 URL 입력 패턴 통합 정리** — 영향 범위가 크므로 독립 리팩토링 spec 으로 분리. 본 spec 은 GlobalEvent 만 적용. → §5.후속 통합 리팩토링 spec.

10. **이미지 업로드 진행률 표시** — `useFileUploadMutation` 자체에 progress callback 없음. ky 의 progress 이벤트 도입 시.

11. **next/image 도입** — Supabase Storage 의 remote pattern 을 `next.config.mjs` 에 등록하면 lint warning 도 제거되고 자동 최적화 (lazy + responsive) 가능. 다만 next/image 의 server fetch 비용 + Storage URL 만료 시 fallback 부재 등 검토 필요. → §5.후속 통합 리팩토링 spec.

### 후속 통합 리팩토링 spec 제안

`docs/superpowers/specs/YYYY-MM-DD-image-upload-consolidation-design.md` (별도 작성 예정) 에서 다룰 항목:

- **다른 도메인 URL 입력 → Uploader 전용 통일** (Notice/Promotion/Banner — 본 §9)
- **업로드 형식/용량 검증 정책 일원화** (`FileController` 레벨 — 본 §6)
- **`<ImageWithFallback>` 공통 컴포넌트 + 도메인 일괄 적용** (본 §7)
- **(선택) Storage orphan cleanup 정책** (cleanup job / outbox — 본 §1)
- **(선택) next/image 도입 + remote pattern 등록** (본 §11)

본 spec 은 위 통합 작업의 **선행 case study** 가 된다 — GlobalEvent 가 Uploader 전용 도메인의 첫 사례. 통합 spec 작성 시 본 spec 의 패턴 (`FilePurpose` enum 추가 / `Coverdoader` 컴포넌트 복제 / `clear*` 플래그) 을 reference 로 활용.

---

## 6. 리스크·체크 포인트

- **`clearCoverImage` 플래그 패턴의 직관성 부족** — `Club.clearCollege` 와 동일 패턴이지만, 처음 보는 API 소비자에게 헷갈릴 수 있음. Swagger `@Operation(description = "...)` 에 "이미지 제거 시 clearCoverImage=true 사용" 명시 권장.
- **`toUpdatePayload(state, initialCoverImageUrl)` 시그니처 확장의 영향**: 다른 호출자 없음 (Edit 페이지 단일 호출). Create 페이지는 `toCreatePayload` 만 사용.
- **응답 경량화 정책의 유효 기간** — 카드 응답에 이미지가 필요한 다른 use case (e.g., 메인 페이지 캐러셀) 가 생기면 정책 재검토. 현재는 캘린더 only 라 유효.
- **Storage orphan 누적 속도** — ADMIN 작성 빈도가 낮아 (월 수~수십 개) MVP 기간 동안 누적량은 무시 가능. 6개월 후 모니터링 후 cleanup job 도입 결정.
- **`<img>` lint warning** — `no-img-element` 는 NoticeCoverUploader 와 동일하게 `eslint-disable-next-line` 주석으로 수용 (Supabase Storage URL 은 next/image 의 remote pattern 등록 부담).
