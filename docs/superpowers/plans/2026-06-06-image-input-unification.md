# 이미지 입력 통일 (URL → ImageUploader) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `<input type="url">` 로 이미지 URL 을 직접 입력받던 4 사용처를 모두 `<ImageUploader>` 기반 파일 업로드로 치환해 프로젝트 전체에서 사용자가 이미지 URL 을 입력하는 화면을 0 개로 만든다.

**Architecture:** 백엔드 `FilePurpose` enum 에 `PROMOTION_REQUEST_BANNER` 한 줄, 프론트 타입 union 한 줄, `ImageUploader` 의 `aspectRatio` 에 `'1/1'` 한 칸 추가, 4 폼 호출처 마이그레이션. DB 스키마 변경 0 — Storage URL 도 기존 `String` 컬럼에 그대로 저장. 기존 외부 URL 데이터는 ImageUploader 미리보기에 그대로 노출되며, 사용자가 "교체" 클릭 시 Storage URL 로 자연스럽게 점진 마이그레이션.

**Tech Stack:** Spring Boot 3.4 / Java 21 (백엔드 1 줄), Next.js 15 + React 19, react-hook-form (PromotionRequestModal), vitest + React Testing Library.

**Spec Reference:** `docs/superpowers/specs/2026-06-06-image-input-unification-design.md`

**Prerequisite:** PR #248 (백엔드 검증) + #249 (ImageUploader / ImageWithFallback) 머지 완료.

---

## File Structure

**Modify (backend, 1 파일):**
- `backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java` — enum 값 한 줄 추가
- `backend/src/test/java/com/duing/domain/file/FileApiTest.java` — 신규 purpose 케이스 1 개 추가

**Modify (frontend types, 1 파일):**
- `frontend/packages/types/src/club.ts` — `FilePurpose` union 에 `'PROMOTION_REQUEST_BANNER'` 추가

**Modify (frontend uploader, 1 파일):**
- `frontend/apps/web/app/_components/ImageUploader.tsx` — `aspectRatio` 에 `'1/1'` 추가
- `frontend/apps/web/test/_components/ImageUploader.test.tsx` — `aspect-square` 클래스 검증 1 케이스 추가

**Modify (frontend forms, 3 파일):**
- `frontend/apps/web/app/admin/clubs/new/_components/AdminClubCreateForm.tsx` — `logoUrl` 입력 교체
- `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx` — `logoUrl` + `coverUrl` 두 곳 교체
- `frontend/apps/web/app/manage/clubs/[clubId]/_components/PromotionRequestModal.tsx` — `suggestedBannerImageUrl` 교체 (react-hook-form `useController`)

**Create (frontend tests, 3 파일):**
- `frontend/apps/web/test/admin/clubs/admin-club-create-form.test.tsx`
- `frontend/apps/web/test/manage/club-info-form-image.test.tsx`
- `frontend/apps/web/test/manage/promotion-request-modal.test.tsx`

---

## Task 1: 백엔드 `PROMOTION_REQUEST_BANNER` enum 값 추가 + 인수 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java`
- Modify: `backend/src/test/java/com/duing/domain/file/FileApiTest.java`

- [ ] **Step 1: enum 값 추가**

`backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java` 의 마지막 enum 값(현재 `GLOBAL_EVENT_COVER`) 뒤에 한 줄 추가. 각 enum 마지막에 콤마가 있는 형식이라면 마지막 항목 콤마 정합성 주의.

기존:
```java
public enum FilePurpose {
    LOGO("club/logo"),
    COVER("club/cover"),
    PHOTO("club/photo"),
    NOTICE_COVER("notice/cover"),
    PROMOTION_BANNER("promotion/banner"),
    GLOBAL_EVENT_COVER("global-event/cover");
    ...
}
```

변경 후:
```java
public enum FilePurpose {
    LOGO("club/logo"),
    COVER("club/cover"),
    PHOTO("club/photo"),
    NOTICE_COVER("notice/cover"),
    PROMOTION_BANNER("promotion/banner"),
    GLOBAL_EVENT_COVER("global-event/cover"),
    PROMOTION_REQUEST_BANNER("promotion-request/banner");
    ...
}
```

- [ ] **Step 2: 컴파일 확인**

```bash
cd backend && ./gradlew compileJava
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: FileApiTest 에 신규 purpose 인수 테스트 추가**

`backend/src/test/java/com/duing/domain/file/FileApiTest.java` 의 마지막 테스트 메서드(`rejectsMissingContentType`) 다음에 다음 메서드 추가:

```java
@Test
@DisplayName("PROMOTION_REQUEST_BANNER purpose 로 정상 JPG 를 업로드하면 promotion-request/banner directory 의 URL 을 반환한다")
void uploadsPromotionRequestBanner() {
    RestAssured
            .given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .multiPart("file", "banner.jpg", bytesOfSize(1024), "image/jpeg")
                .queryParam("purpose", "PROMOTION_REQUEST_BANNER")
            .when()
                .post("/api/v1/files")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .body("data.url", org.hamcrest.Matchers.containsString("promotion-request/banner"));
}
```

> 참고: `StubFileStorageService.upload(file, directory)` 가 `"/files/stub/" + directory + "/" + name` 형식 URL 을 반환하므로, `containsString("promotion-request/banner")` 으로 directory 가 올바르게 전달됐는지 검증된다.

- [ ] **Step 4: 테스트 실행**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.file.FileApiTest"
```

Expected: 기존 7 + 신규 1 = 8/8 PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java backend/src/test/java/com/duing/domain/file/FileApiTest.java
git commit -m "feat(backend): FilePurpose PROMOTION_REQUEST_BANNER 추가"
```

---

## Task 2: 프론트 타입 union 확장

**Files:**
- Modify: `frontend/packages/types/src/club.ts`

- [ ] **Step 1: union 에 새 멤버 추가**

`frontend/packages/types/src/club.ts` 의 `FilePurpose` type 라인을 다음으로 교체:

```ts
export type FilePurpose =
  | 'LOGO'
  | 'COVER'
  | 'PHOTO'
  | 'NOTICE_COVER'
  | 'PROMOTION_BANNER'
  | 'GLOBAL_EVENT_COVER'
  | 'PROMOTION_REQUEST_BANNER';
```

기존이 한 줄 유니온이었다면 다음과 같이 한 줄 유지 + 마지막에 추가하는 변형도 동등:

```ts
export type FilePurpose = 'LOGO' | 'COVER' | 'PHOTO' | 'NOTICE_COVER' | 'PROMOTION_BANNER' | 'GLOBAL_EVENT_COVER' | 'PROMOTION_REQUEST_BANNER';
```

기존 파일의 줄바꿈 스타일을 그대로 유지하면 된다.

- [ ] **Step 2: types 패키지 빌드 + web typecheck**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/types build && pnpm --filter @duing/web typecheck
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/types/src/club.ts
git commit -m "feat(types): FilePurpose 에 PROMOTION_REQUEST_BANNER 추가"
```

---

## Task 3: ImageUploader 의 aspectRatio 에 `'1/1'` 추가 (TDD)

**Files:**
- Modify: `frontend/apps/web/app/_components/ImageUploader.tsx`
- Modify: `frontend/apps/web/test/_components/ImageUploader.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`frontend/apps/web/test/_components/ImageUploader.test.tsx` 의 `describe('ImageUploader', ...)` 마지막에 다음 it 블록 추가:

```tsx
it('aspectRatio="1/1" 가 전달되면 컨테이너에 aspect-square 클래스가 적용된다', () => {
  const onChange = vi.fn();
  const { container } = render(
    <ImageUploader value="" onChange={onChange} purpose="LOGO" aspectRatio="1/1" placeholder="로고" />,
  );
  expect(container.querySelector('.aspect-square')).not.toBeNull();
  expect(container.querySelector('.aspect-\\[16\\/9\\]')).toBeNull();
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/web test -- ImageUploader
```

Expected: 새 케이스가 타입 에러(`'1/1'` 가 union 에 없음) 또는 어설션 실패. 컴파일 통과해 어설션 실패라면 `aspect-[16/9]` 가 적용되어 `aspect-square` 가 없음.

- [ ] **Step 3: 컴포넌트 수정**

`frontend/apps/web/app/_components/ImageUploader.tsx` 의 두 곳을 수정.

**변경 1 — Props 의 `aspectRatio` union 에 `'1/1'` 추가:**

기존:
```tsx
aspectRatio?: '16/9' | '4/3';
```

교체:
```tsx
aspectRatio?: '1/1' | '16/9' | '4/3';
```

**변경 2 — `ASPECT_CLASS` 매핑에 `'1/1'` 추가:**

기존:
```tsx
const ASPECT_CLASS: Record<NonNullable<Props['aspectRatio']>, string> = {
  '16/9': 'aspect-[16/9]',
  '4/3': 'aspect-[4/3]',
};
```

교체:
```tsx
const ASPECT_CLASS: Record<NonNullable<Props['aspectRatio']>, string> = {
  '1/1': 'aspect-square',
  '16/9': 'aspect-[16/9]',
  '4/3': 'aspect-[4/3]',
};
```

default 값 `'16/9'` 와 기본 동작은 그대로 유지된다 (기존 호출처 영향 없음).

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/web test -- ImageUploader
```

Expected: 기존 5 + 신규 1 = 6/6 PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/_components/ImageUploader.tsx frontend/apps/web/test/_components/ImageUploader.test.tsx
git commit -m "feat(frontend): ImageUploader aspectRatio 에 1/1 (aspect-square) 추가"
```

---

## Task 4: AdminClubCreateForm 마이그레이션 (TDD)

**Files:**
- Modify: `frontend/apps/web/app/admin/clubs/new/_components/AdminClubCreateForm.tsx`
- Create: `frontend/apps/web/test/admin/clubs/admin-club-create-form.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/admin/clubs/admin-club-create-form.test.tsx` 신규 파일:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockImageUploader = vi.fn();
vi.mock('../../../app/_components/ImageUploader', () => ({
  ImageUploader: (props: {
    value: string;
    onChange: (url: string) => void;
    purpose: string;
    aspectRatio?: string;
    placeholder?: string;
  }) => {
    mockImageUploader(props);
    return (
      <input
        data-testid="logo-uploader"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  },
}));

vi.mock('@duing/hooks', () => ({
  useCreateClubMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useAdminUserSearchQuery: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { AdminClubCreateForm } from '../../../app/admin/clubs/new/_components/AdminClubCreateForm';

describe('AdminClubCreateForm', () => {
  beforeEach(() => {
    mockImageUploader.mockReset();
  });

  it('로고 이미지 영역에 ImageUploader 가 purpose="LOGO" + aspectRatio="1/1" 로 렌더된다', () => {
    render(<AdminClubCreateForm />);
    expect(screen.getByTestId('logo-uploader')).toBeInTheDocument();
    const lastCall = mockImageUploader.mock.calls.at(-1)?.[0];
    expect(lastCall?.purpose).toBe('LOGO');
    expect(lastCall?.aspectRatio).toBe('1/1');
  });

  it('URL input 이 더 이상 존재하지 않는다', () => {
    const { container } = render(<AdminClubCreateForm />);
    expect(container.querySelector('input[type="url"]')).toBeNull();
  });

  it('ImageUploader onChange 가 호출되면 다음 렌더에 새 value 가 전달된다', () => {
    render(<AdminClubCreateForm />);
    const input = screen.getByTestId('logo-uploader');
    fireEvent.change(input, { target: { value: 'https://storage.example.com/x.jpg' } });
    const lastCall = mockImageUploader.mock.calls.at(-1)?.[0];
    expect(lastCall?.value).toBe('https://storage.example.com/x.jpg');
  });
});
```

> 참고: `AdminClubCreateForm` 이 다른 hook 들(`useAdminUserSearchQuery` 등) 을 사용한다면 위 mock 에 함께 포함. 실제 import 가 다르면 모듈 mock 시 누락 export 가 있을 수 있으니 첫 실행 후 누락 보강.

- [ ] **Step 2: 실패 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/web test -- admin-club-create-form
```

Expected: `input[type="url"]` 이 여전히 있어 두 번째 케이스 실패, 또는 ImageUploader 가 안 보여 첫 케이스 실패.

- [ ] **Step 3: AdminClubCreateForm 의 logoUrl 입력 교체**

`frontend/apps/web/app/admin/clubs/new/_components/AdminClubCreateForm.tsx`.

**변경 1 — import 추가 (다른 _components import 라인 옆):**

```tsx
import { ImageUploader } from '../../../_components/ImageUploader';
```

**변경 2 — `<Field label="로고 URL">` 블록 전체 교체.**

기존 (line 180-187 근처):
```tsx
<Field label="로고 URL">
  <input
    type="url"
    value={logoUrl}
    onChange={(event) => setLogoUrl(event.target.value)}
    maxLength={500}
    placeholder="https://..."
    className="border-line bg-paper w-full rounded-md border px-3 py-2 text-sm"
  />
</Field>
```

교체:
```tsx
<Field label="로고 이미지 (선택)">
  <ImageUploader
    value={logoUrl}
    onChange={setLogoUrl}
    purpose="LOGO"
    aspectRatio="1/1"
    placeholder="로고 이미지를 업로드하세요 (선택)"
    altText="로고"
  />
</Field>
```

**변경 3 — `validate()` 내부의 메시지 문구에서 "URL" 표현 제거:**

기존 (line 57):
```ts
if (logoUrl.trim().length > 500) return '로고 URL은 500자 이하여야 합니다.';
```

교체:
```ts
if (logoUrl.trim().length > 500) return '로고 이미지 경로가 너무 깁니다.';
```

본 PR 의 목표는 사용자에게 "URL" 이라는 개념 자체를 노출하지 않는 것이므로 메시지 문구도 URL 단어를 제거한다. Storage URL 도 500자 이내이므로 이 검증은 안전 가드로만 작동.

`logoUrl` state 선언, payload 변환 (`logoUrl.trim() || undefined`), `setLogoUrl` setter 는 그대로 유지.

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/web test -- admin-club-create-form && pnpm --filter @duing/web typecheck
```

Expected: 3/3 PASS + 타입체크 통과.

만약 첫 실행 시 mock 부족으로 throw 한다면 Step 1 의 `vi.mock('@duing/hooks', ...)` 블록에 누락된 export 를 추가하고 재실행.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/clubs/new/_components/AdminClubCreateForm.tsx frontend/apps/web/test/admin/clubs/admin-club-create-form.test.tsx
git commit -m "refactor(frontend): AdminClubCreateForm 의 로고 URL 입력을 ImageUploader 로 교체"
```

---

## Task 5: ClubInfoForm 의 logoUrl + coverUrl 마이그레이션 (TDD)

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`
- Create: `frontend/apps/web/test/manage/club-info-form-image.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/manage/club-info-form-image.test.tsx` 신규 파일:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockImageUploaderCalls: Array<{
  value: string;
  purpose: string;
  aspectRatio?: string;
  testId: string;
}> = [];

vi.mock('@/app/_components/ImageUploader', () => ({
  ImageUploader: (props: {
    value: string;
    onChange: (url: string) => void;
    purpose: string;
    aspectRatio?: string;
    altText?: string;
  }) => {
    const testId =
      props.purpose === 'LOGO' ? 'logo-uploader'
      : props.purpose === 'COVER' ? 'cover-uploader'
      : `uploader-${props.purpose}`;
    mockImageUploaderCalls.push({
      value: props.value,
      purpose: props.purpose,
      aspectRatio: props.aspectRatio,
      testId,
    });
    return (
      <input
        data-testid={testId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  },
}));

vi.mock('@/app/_components/ImageWithFallback', () => ({
  ImageWithFallback: (props: { src: string | null | undefined; alt: string }) => (
    <div data-testid={`fallback-${props.alt}`} data-src={props.src ?? ''} />
  ),
}));

vi.mock('@duing/hooks', () => ({
  useUpdateClubMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

import { ClubInfoForm } from '../../app/manage/clubs/[clubId]/info/_components/ClubInfoForm';
import type { ClubDetail } from '@duing/types';

function makeDetail(overrides: Partial<ClubDetail> = {}): ClubDetail {
  return {
    id: 1,
    name: '두잉',
    category: 'ACADEMIC',
    division: '소프트웨어',
    college: 'IT_ENGINEERING',
    description: null,
    logoUrl: 'https://imgur.com/old-logo.png',
    coverUrl: 'https://imgur.com/old-cover.png',
    tags: [],
    snsLinks: [],
    faqs: [],
    foundedYear: null,
    cohortNumber: null,
    location: null,
    contactEmail: null,
    activityFrequency: null,
    activeDays: [],
    membershipFee: null,
    tagline: null,
    highlights: [],
    majorProjects: null,
    leaderName: '리더',
    status: 'CERTIFIED',
    centralClub: false,
    photoCount: 0,
    ...overrides,
  } as ClubDetail;
}

describe('ClubInfoForm 의 이미지 입력', () => {
  beforeEach(() => {
    mockImageUploaderCalls.length = 0;
  });

  it('logoUrl 영역에 ImageUploader 가 purpose=LOGO + aspectRatio=1/1 로 렌더된다', () => {
    render(<ClubInfoForm clubId={1} detail={makeDetail()} readOnly={false} />);
    expect(screen.getByTestId('logo-uploader')).toBeInTheDocument();
    const logoCall = mockImageUploaderCalls.find((c) => c.purpose === 'LOGO');
    expect(logoCall?.aspectRatio).toBe('1/1');
    expect(logoCall?.value).toBe('https://imgur.com/old-logo.png');
  });

  it('coverUrl 영역에 ImageUploader 가 purpose=COVER + aspectRatio=16/9 로 렌더된다', () => {
    render(<ClubInfoForm clubId={1} detail={makeDetail()} readOnly={false} />);
    expect(screen.getByTestId('cover-uploader')).toBeInTheDocument();
    const coverCall = mockImageUploaderCalls.find((c) => c.purpose === 'COVER');
    expect(coverCall?.aspectRatio).toBe('16/9');
    expect(coverCall?.value).toBe('https://imgur.com/old-cover.png');
  });

  it('기존 URL 입력 필드가 남아있지 않다', () => {
    const { container } = render(
      <ClubInfoForm clubId={1} detail={makeDetail()} readOnly={false} />,
    );
    expect(container.querySelector('input[type="url"][value*="imgur"]')).toBeNull();
    const urlInputs = container.querySelectorAll('input[type="url"]');
    urlInputs.forEach((node) => {
      expect(node.getAttribute('id')).not.toBe('f-logo');
      expect(node.getAttribute('id')).not.toBe('f-cover');
    });
  });

  it('readOnly=true 면 ImageUploader 대신 ImageWithFallback 으로 표시 전용 렌더된다', () => {
    render(<ClubInfoForm clubId={1} detail={makeDetail()} readOnly={true} />);
    expect(screen.queryByTestId('logo-uploader')).toBeNull();
    expect(screen.queryByTestId('cover-uploader')).toBeNull();
    const logoFallback = screen.getByTestId('fallback-로고');
    expect(logoFallback.getAttribute('data-src')).toBe('https://imgur.com/old-logo.png');
    const coverFallback = screen.getByTestId('fallback-커버');
    expect(coverFallback.getAttribute('data-src')).toBe('https://imgur.com/old-cover.png');
  });
});
```

> 참고: `ClubInfoForm` 이 다른 hook / 자식 컴포넌트(ActiveDaysToggle, SnsLinksRepeater 등) 도 의존한다면 모듈 mock 이 더 필요할 수 있다. 실제 실행 시 에러 메시지 보고 누락된 의존성을 mock 에 추가.

- [ ] **Step 2: 실패 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/web test -- club-info-form-image
```

Expected: `getByTestId('logo-uploader')` 가 매칭 안 됨 (아직 ImageUploader 사용 안 함).

- [ ] **Step 3: ClubInfoForm 의 두 입력 교체**

`frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`.

**변경 1 — import 추가:**

```tsx
import { ImageUploader } from '@/app/_components/ImageUploader';
import { ImageWithFallback } from '@/app/_components/ImageWithFallback';
```

조회 모드(`readOnly`) 에서는 업로드 UI 가 어색하므로 표시 전용 `<ImageWithFallback>` 으로 분기한다 — 의미상 "조회 = 표시 / 편집 = 업로드" 가 명확.

**변경 2 — `로고 URL` 블록 (대략 line 282-294) 전체 교체.**

기존:
```tsx
<div className={fieldCls}>
  <label htmlFor="f-logo" className={labelCls}>로고 URL</label>
  <input
    id="f-logo"
    type="url"
    value={logoUrl}
    onChange={(event) => setLogoUrl(event.target.value)}
    placeholder="https://..."
    className={inputCls}
    disabled={readOnly}
  />
</div>
```

교체:
```tsx
<div className={fieldCls}>
  <label className={labelCls}>로고 이미지</label>
  {readOnly ? (
    <ImageWithFallback
      src={logoUrl}
      alt="로고"
      className="aspect-square rounded-xl overflow-hidden border border-line max-w-[240px]"
      emptyMessage="로고 이미지가 없습니다"
    />
  ) : (
    <ImageUploader
      value={logoUrl}
      onChange={setLogoUrl}
      purpose="LOGO"
      aspectRatio="1/1"
      placeholder="로고 이미지를 업로드하세요"
      altText="로고"
    />
  )}
</div>
```

`htmlFor="f-logo"` 의존성 제거 후 라벨에 `htmlFor` 속성 제거. 표시 전용일 때는 `max-w-[240px]` 으로 1:1 박스가 페이지를 가로지르지 않도록 제한.

**변경 3 — `커버 URL` 블록 (대략 line 294-306) 동일 패턴으로 교체.**

기존:
```tsx
<div className={fieldCls}>
  <label htmlFor="f-cover" className={labelCls}>커버 URL</label>
  <input
    id="f-cover"
    type="url"
    value={coverUrl}
    onChange={(event) => setCoverUrl(event.target.value)}
    placeholder="https://..."
    className={inputCls}
    disabled={readOnly}
  />
</div>
```

교체:
```tsx
<div className={fieldCls}>
  <label className={labelCls}>커버 이미지</label>
  {readOnly ? (
    <ImageWithFallback
      src={coverUrl}
      alt="커버"
      className="aspect-[16/9] rounded-xl overflow-hidden border border-line"
      emptyMessage="커버 이미지가 없습니다"
    />
  ) : (
    <ImageUploader
      value={coverUrl}
      onChange={setCoverUrl}
      purpose="COVER"
      aspectRatio="16/9"
      placeholder="커버 이미지를 업로드하세요"
      altText="커버"
    />
  )}
</div>
```

`logoUrl` / `coverUrl` state 선언 + `buildPayload` 내부의 변경 감지 + 제출 로직은 모두 그대로 유지.

- [ ] **Step 4: 테스트 통과 확인 + 전체 club-info 회귀 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/web test -- club-info && pnpm --filter @duing/web typecheck
```

Expected: 신규 3/3 PASS + 기존 `club-info-form.test.tsx` (ActiveDaysToggle) 영향 없음 + 타입체크 통과.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx frontend/apps/web/test/manage/club-info-form-image.test.tsx
git commit -m "refactor(frontend): ClubInfoForm 의 로고/커버 URL 입력을 ImageUploader 로 교체"
```

---

## Task 6: PromotionRequestModal 마이그레이션 (useController, TDD)

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/_components/PromotionRequestModal.tsx`
- Create: `frontend/apps/web/test/manage/promotion-request-modal.test.tsx`

이 파일은 react-hook-form 의 `register('suggestedBannerImageUrl')` 로 input 을 wire 하고 있다. `<ImageUploader>` 는 controlled `value`/`onChange` 패턴이므로 `useController` 로 전환한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/manage/promotion-request-modal.test.tsx` 신규 파일:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockImageUploaderCalls: Array<{
  value: string;
  purpose: string;
  aspectRatio?: string;
}> = [];

vi.mock('@/app/_components/ImageUploader', () => ({
  ImageUploader: (props: {
    value: string;
    onChange: (url: string) => void;
    purpose: string;
    aspectRatio?: string;
  }) => {
    mockImageUploaderCalls.push({
      value: props.value,
      purpose: props.purpose,
      aspectRatio: props.aspectRatio,
    });
    return (
      <input
        data-testid="banner-uploader"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  },
}));

const mockSubmit = vi.fn();
vi.mock('@duing/hooks', () => ({
  useSubmitPromotionRequestMutation: () => ({
    mutate: mockSubmit,
    isPending: false,
  }),
}));

import { PromotionRequestModal } from '../../app/manage/clubs/[clubId]/_components/PromotionRequestModal';

describe('PromotionRequestModal 의 배너 이미지 입력', () => {
  beforeEach(() => {
    mockImageUploaderCalls.length = 0;
    mockSubmit.mockReset();
  });

  it('배너 이미지 영역에 ImageUploader 가 purpose=PROMOTION_REQUEST_BANNER + aspectRatio=16/9 로 렌더된다', () => {
    render(<PromotionRequestModal clubId={1} clubName="두잉" onClose={vi.fn()} />);
    expect(screen.getByTestId('banner-uploader')).toBeInTheDocument();
    const lastCall = mockImageUploaderCalls.at(-1);
    expect(lastCall?.purpose).toBe('PROMOTION_REQUEST_BANNER');
    expect(lastCall?.aspectRatio).toBe('16/9');
    expect(lastCall?.value).toBe('');
  });

  it('URL input 이 더 이상 존재하지 않는다 (배너 이미지 한정)', () => {
    const { container } = render(
      <PromotionRequestModal clubId={1} clubName="두잉" onClose={vi.fn()} />,
    );
    const urlInputs = container.querySelectorAll('input[type="url"]');
    urlInputs.forEach((node) => {
      expect(node.getAttribute('id')).not.toBe('promo-banner-url');
    });
  });

  it('ImageUploader onChange 가 트리거되고 폼 제출 시 새 URL 이 mutation payload 에 포함된다', () => {
    render(<PromotionRequestModal clubId={1} clubName="두잉" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: '제목 ok' } });
    fireEvent.change(screen.getByLabelText(/설명/), { target: { value: '설명 ok' } });
    fireEvent.change(screen.getByTestId('banner-uploader'), {
      target: { value: 'https://storage.example.com/banner.jpg' },
    });
    fireEvent.click(screen.getByRole('button', { name: /요청|제출|보내기/ }));
    expect(mockSubmit).toHaveBeenCalled();
    const payload = mockSubmit.mock.calls.at(-1)?.[0];
    expect(payload?.suggestedBannerImageUrl).toBe('https://storage.example.com/banner.jpg');
  });
});
```

> 참고: 실제 제출 버튼 라벨이 다른 텍스트일 수 있으니 `getByRole('button', { name: /요청|제출|보내기/ })` regex 가 첫 실행 시 매칭 안 되면 실제 라벨로 교체. 비슷하게 `getByLabelText(/제목/)` 도 실제 라벨 텍스트와 일치하는지 확인.

- [ ] **Step 2: 실패 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/web test -- promotion-request-modal
```

Expected: ImageUploader testid 미존재 등으로 첫 케이스 실패.

- [ ] **Step 3: PromotionRequestModal 의 배너 input 교체**

`frontend/apps/web/app/manage/clubs/[clubId]/_components/PromotionRequestModal.tsx`.

**변경 1 — import 추가:**

기존 `import { useForm } from 'react-hook-form';` 라인을 다음으로 교체:

```tsx
import { useForm, useController } from 'react-hook-form';
```

그리고 ImageUploader import 추가 (다른 `@/app/...` import 옆):
```tsx
import { ImageUploader } from '@/app/_components/ImageUploader';
```

**변경 2 — `useForm()` 구조분해에 `control` 추가.**

기존 (line 21-28):
```tsx
const {
  register,
  handleSubmit,
  watch,
  formState: { errors, isSubmitting },
} = useForm<SubmitPromotionRequestInput>({
  resolver: zodResolver(submitPromotionRequestSchema),
});
```

교체:
```tsx
const {
  register,
  handleSubmit,
  watch,
  control,
  formState: { errors, isSubmitting },
} = useForm<SubmitPromotionRequestInput>({
  resolver: zodResolver(submitPromotionRequestSchema),
});

const { field: bannerField } = useController({
  control,
  name: 'suggestedBannerImageUrl',
  defaultValue: '',
});
```

**변경 3 — 배너 input 블록 (대략 line 152-178) 을 ImageUploader 로 교체.**

기존:
```tsx
<div>
  <label
    htmlFor="promo-banner-url"
    className="mb-1.5 block text-sm font-semibold text-ink"
  >
    희망 배너 이미지 URL
    <span className="ml-1 text-xs font-normal text-charcoal-3">(선택)</span>
  </label>
  <input
    id="promo-banner-url"
    type="url"
    placeholder="https://..."
    {...register('suggestedBannerImageUrl')}
    className={cn(
      'w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors',
      // ...기존 className 들...
    )}
  />
  {errors.suggestedBannerImageUrl && (
    <p className="mt-1 text-xs text-rose-500">
      {errors.suggestedBannerImageUrl.message}
    </p>
  )}
</div>
```

교체:
```tsx
<div>
  <label className="mb-1.5 block text-sm font-semibold text-ink">
    희망 배너 이미지
    <span className="ml-1 text-xs font-normal text-charcoal-3">(선택)</span>
  </label>
  <ImageUploader
    value={bannerField.value ?? ''}
    onChange={bannerField.onChange}
    purpose="PROMOTION_REQUEST_BANNER"
    aspectRatio="16/9"
    placeholder="희망 배너 이미지를 업로드하세요 (선택)"
    altText="희망 배너"
  />
  {errors.suggestedBannerImageUrl && (
    <p className="mt-1 text-xs text-rose-500">
      {errors.suggestedBannerImageUrl.message}
    </p>
  )}
</div>
```

`onSubmit` 의 `suggestedBannerImageUrl: formData.suggestedBannerImageUrl?.trim() || undefined` 변환 로직은 그대로 유지된다 (`useController` 가 동일한 form state 에 저장).

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/web test -- promotion-request-modal && pnpm --filter @duing/web typecheck
```

Expected: 3/3 PASS + 타입체크 통과.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/[clubId]/_components/PromotionRequestModal.tsx frontend/apps/web/test/manage/promotion-request-modal.test.tsx
git commit -m "refactor(frontend): PromotionRequestModal 의 배너 URL 입력을 ImageUploader 로 교체"
```

---

## Task 7: 빌드 + 전체 회귀 + dev 수동 확인

**Files:** (수정 없음)

- [ ] **Step 1: 프론트 빌드**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/web build
```

Expected: 빌드 성공.

- [ ] **Step 2: 프론트 전체 테스트**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/web test
```

Expected: 기존 28+ test files + 신규 4 = 모두 PASS.

- [ ] **Step 3: 백엔드 전체 테스트**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test
```

Expected: 전체 PASS.

- [ ] **Step 4: 성공 조건 grep 검증**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && grep -rn 'type="url"' frontend/apps/web/app --include="*.tsx" | grep -iE 'logoUrl|coverUrl|imageUrl|bannerImageUrl'
```

Expected: 0 건 출력. (외부 링크용 `linkUrl` / `externalFormUrl` / SNS / `suggestedLinkUrl` 등 6 곳은 그대로 남아있는 것이 정상 — 이미지 URL 패턴만 0 건이어야 함.)

- [ ] **Step 5: dev 서버 수동 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/web dev
```

브라우저에서 다음 4 화면을 확인:

1. `/admin/clubs/new` — 로고 슬롯에 1:1 미리보기 placeholder 노출. 1MB JPG 업로드 → 미리보기 + 교체/제거 버튼. GIF 업로드 → "지원하지 않는 이미지 형식" inline 에러.
2. `/manage/clubs/{기존 동아리 id}/info` — logoUrl 이 외부 URL(`https://imgur.com/...`) 인 동아리를 골라 접속. ImageUploader 에 미리보기로 외부 이미지 노출 (혹은 ImageWithFallback 의 fallback). "교체" 클릭 → Supabase Storage URL 로 교체. coverUrl 도 16:9 비율로 동일 검증.
3. `/manage/clubs/{운영진 동아리 id}` 의 홍보 요청 모달 (홍보 요청 버튼 클릭) — 배너 이미지 슬롯에 16:9 ImageUploader 노출. 업로드 / 제거 정상 동작.
4. 콘솔/네트워크 탭에서 비로그인/권한 부족 시 에러 없이 부드럽게 동작하는지 확인 (기존 #248 / #249 검증 흐름 그대로).

수동 확인 결과 모두 OK 면 Task 8 로 이동. 실패 케이스 발견 시 해당 task 로 복귀 후 수정.

---

## Task 8: PR 생성

**Files:** (수정 없음)

- [ ] **Step 1: 브랜치 push**

작업 시작 시 `develop` 에서 `feat/image-input-unification` 으로 분기했다고 가정. 미분기 상태라면 먼저:

```bash
git checkout -b feat/image-input-unification develop
```

이미 분기되어 있으면:

```bash
git push -u origin feat/image-input-unification
```

- [ ] **Step 2: PR 생성**

```bash
gh pr create --base develop --title "feat: 이미지 입력 통일 (URL → ImageUploader)" --body "$(cat <<'EOF'
## 🚀 작업 내용

PR #248 / #249 로 GlobalEvent · Notice · Promotion 의 이미지 등록은 ImageUploader 기반으로 통일됐으나, AdminClubCreate / ClubInfo (logo + cover) / PromotionRequestModal 4 사용처가 여전히 `<input type="url">` 로 이미지 URL 을 직접 입력받고 있었다. 본 PR 로 이 4 사용처를 모두 `<ImageUploader>` 로 치환해 프로젝트 전체에서 사용자가 이미지 URL 을 입력하는 화면을 0 개로 만든다.

백엔드는 `FilePurpose` enum 에 `PROMOTION_REQUEST_BANNER` 한 줄만 추가했고, ImageUploader 는 로고용 `aspectRatio="1/1"` (Tailwind `aspect-square`) 지원만 늘렸다. DB 스키마 변경은 없다 — Storage URL 도 기존 `String` 컬럼에 그대로 저장.

## 🤔 고민했던 내용

기존 외부 URL 데이터의 처리는 일괄 배치 잡 대신 점진 마이그레이션을 택했다. ImageUploader 미리보기에 외부 URL 이 그대로 노출되므로 운영진이 자기 동아리 정보를 수정할 때 "교체" 한 번이면 Storage URL 로 자연스럽게 갱신된다. CORS / 죽은 URL / 대용량 처리 등 일괄 잡의 복잡도를 피할 수 있다.

PromotionRequestModal 은 react-hook-form 의 `register('suggestedBannerImageUrl')` 패턴을 쓰고 있어 `<ImageUploader>` 의 controlled value/onChange 와 인터페이스가 맞지 않는다. `useController` 로 명시 전환해 react-hook-form 의 form state 안에서 그대로 동작하도록 했다.

## 💬 리뷰 중점사항

- `<ImageUploader aspectRatio="1/1">` 의 로고 슬롯이 시각적으로 자연스러운지
- ClubInfoForm 의 readOnly 분기에서 ImageUploader 의 onChange 를 no-op 으로 흉내낸 처리가 충분한지 (ImageUploader 자체에 disabled prop 추가가 더 깔끔할 수 있음 — 본 PR 범위 밖)
- 기존 외부 URL 이 ImageUploader 의 미리보기에 노출될 때 UX 가 자연스러운지

## Prerequisite

PR #248 (백엔드 파일 검증) + PR #249 (ImageUploader / ImageWithFallback) 머지 완료.

## 후속 작업 후보 (이번 PR 범위 밖)

- PhotoUploader 통합 (멀티 업로드)
- 외부 URL → Storage 일괄 마이그레이션 배치 잡 (필요 시)
- Storage orphan cleanup
- `next/image` 전환

## Spec / Out of Scope

- 설계: `docs/superpowers/specs/2026-06-06-image-input-unification-design.md`
- Out of Scope: 외부 링크 URL 입력 (`linkUrl` / `externalFormUrl` / SNS / `suggestedLinkUrl`) 은 모두 보존
EOF
)"
```

- [ ] **Step 3: CI 통과 확인**

```bash
gh pr checks <PR번호>
```

`backend-ci.yml` + `frontend-ci.yml` 양쪽 모두 PASS 확인 후 머지.

---

## Acceptance Criteria

본 PR 머지 직전 다음을 모두 만족해야 한다.

**입력 UI 제거 (사용자에게 URL 노출 0):**
- [ ] `AdminClubCreateForm` 에 이미지 URL 입력 필드(`<input type="url">` for logo) 가 존재하지 않는다.
- [ ] `ClubInfoForm` 에 logoUrl / coverUrl URL 입력 필드가 존재하지 않는다.
- [ ] `PromotionRequestModal` 에 suggestedBannerImageUrl URL 입력 필드가 존재하지 않는다.
- [ ] 화면에 노출되는 라벨/플레이스홀더/검증 메시지에서 "URL" 단어가 사라졌다 (이미지 입력 영역 한정).

**컴포넌트 선택 정합성:**
- [ ] logoUrl 은 `<ImageUploader purpose="LOGO" aspectRatio="1/1">` 를 사용한다 (AdminClubCreateForm, ClubInfoForm 양쪽).
- [ ] coverUrl 은 `<ImageUploader purpose="COVER" aspectRatio="16/9">` 를 사용한다.
- [ ] suggestedBannerImageUrl 은 `<ImageUploader purpose="PROMOTION_REQUEST_BANNER" aspectRatio="16/9">` 를 사용한다.
- [ ] `ClubInfoForm` 의 `readOnly=true` 분기는 `<ImageWithFallback>` 으로 표시 전용 렌더되며 업로드 UI 가 노출되지 않는다.

**데이터 호환:**
- [ ] DB 에 기존 외부 URL (예: `https://imgur.com/...`) 로 저장된 logoUrl/coverUrl 이 콘텐츠 표시 화면(ClubCard, ClubDetailHero 등) 에서 정상 표시된다.
- [ ] 동일 외부 URL 이 ClubInfoForm 수정 화면 진입 시 ImageUploader 의 미리보기에 그대로 노출된다.
- [ ] 운영진이 "교체" 클릭 후 새 이미지를 업로드하면 Storage URL 로 갱신되어 저장된다.
- [ ] DB 스키마는 변경되지 않는다 (Flyway 마이그레이션 신규 파일 0).

**테스트 / 빌드:**
- [ ] `FileApiTest` 8/8 PASS (기존 7 + PROMOTION_REQUEST_BANNER 1).
- [ ] `ImageUploader.test.tsx` 6/6 PASS (기존 5 + aspect-square 1).
- [ ] 신규 폼 단위 테스트 3 파일 모두 PASS.
- [ ] `pnpm --filter @duing/web build` 성공.
- [ ] `./gradlew test` 전체 PASS (회귀 없음).

**참고 검증 (자동):**
```bash
grep -rn 'type="url"' frontend/apps/web/app --include="*.tsx" \
  | grep -iE 'logoUrl|coverUrl|imageUrl|bannerImageUrl'
```
0 건 출력.

---

## Self-Review

**Spec 커버리지:**
- §3.1 (backend FilePurpose) = Task 1
- §3.2 (types union) = Task 2
- §3.3 (ImageUploader aspectRatio 확장) = Task 3
- §3.4 (1) AdminClubCreateForm = Task 4
- §3.4 (2)(3) ClubInfoForm = Task 5
- §3.4 (4) PromotionRequestModal (useController) = Task 6
- §4 기존 외부 URL 점진 마이그레이션 = ImageUploader 가 외부 URL 을 value 로 받아 미리보기에 노출하는 동작이 컴포넌트 차원에서 이미 구현돼 있음 (PR #249), 본 plan 의 호출처 마이그레이션이 이를 활용
- §6 테스트 전략 = Task 1 (인수), Task 3 (단위), Task 4/5/6 (각 폼 단위 테스트), Task 7 (빌드 + 전체 + 수동)
- §9 성공 조건 grep = Task 7 Step 4

**플레이스홀더:** 없음. 모든 단계에 전체 코드 또는 정확한 명령 포함.

**타입 일관성:**
- `PROMOTION_REQUEST_BANNER` 가 Task 1 (백엔드 enum) ↔ Task 2 (프론트 union) ↔ Task 6 (호출처 `purpose=...`) 모두 동일 문자열
- `aspectRatio="1/1"` ↔ `ASPECT_CLASS['1/1'] = 'aspect-square'` ↔ Task 3 테스트 어설션 (`aspect-square` 클래스 검색) 일치
- ImageUploader 의 `purpose` prop 타입(`FilePurpose`) ↔ Task 2 의 union 확장 정합성

**잠재 위험:**
- Task 4 / 5 / 6 의 폼별 단위 테스트가 첫 실행 시 모듈 mock 누락으로 throw 할 가능성 — 각 Task Step 1 의 mock 블록을 첫 실패 메시지에 따라 보강하는 방식이 표준 패턴.
- Task 6 의 제출 버튼/라벨 정규식 (`/요청|제출|보내기/`, `/제목/`, `/설명/`) 이 실제 라벨 텍스트와 다르면 실패 — 실제 텍스트 확인 후 교체.
- `ClubInfoForm` 의 `readOnly` 분기에서 표시 전용 `ImageWithFallback` 로 전환 — 기존 disabled URL input 의 시각 효과와 다르므로 dev 수동 확인 시 함께 검증 필요.
