# 이미지 업로드 통합 리팩토링 설계

> **작성일:** 2026-06-05
> **상태:** 설계 승인 대기
> **분할:** PR1 (백엔드 검증) + PR2 (프론트엔드 통합 + fallback)

## 1. 배경

GlobalEvent 표지 이미지 PR(#243/#244)을 끝낸 시점에 다음 부채가 누적되어 있다.

- **업로더 컴포넌트 중복:** `NoticeCoverUploader`, `GlobalEventCoverUploader`, `PromotionBannerUploader` 세 파일이 거의 동일한 ~64 라인 (입력/미리보기/버튼/에러 표시) 을 반복한다. 신규 도메인이 늘어날 때마다 같은 코드가 한 벌씩 추가되는 구조.
- **이미지 로드 실패 처리 부재:** Supabase Storage URL 을 표시하는 `EventDetailModal`, `NoticeCard`, `NoticePage` 등은 모두 `<img>` 를 직접 렌더하며 `onError` 처리가 없다. 캐시 만료·일시 장애·삭제된 객체 등에서 깨진 이미지가 그대로 노출된다.
- **업로드 형식/용량 검증 부재:** 백엔드 `FileController` 는 `MultipartFile` 을 받아 `FileStorageService` 로 그대로 위임할 뿐 형식/용량 검증이 없다. 프론트도 `accept="image/*"` 속성에만 의존하므로 GIF·BMP·100MB 파일이 그대로 Storage 로 흘러갈 수 있다.

## 2. 목표

신규 기능을 추가하지 않고, **기존 4개 업로드 도메인의 안정성·일관성을 강화**한다.

1. 업로더 코드 중복 제거 — 단일 `<ImageUploader>` 로 통합.
2. 사용자 콘텐츠 이미지 표시 전구간에 `<ImageWithFallback>` 적용 — 깨진 이미지 노출 차단.
3. JPG/PNG/WEBP + 5MB 정책을 프론트(즉시 차단) + 백엔드(최종 방어) 양쪽에서 검증.

## 3. 변경 범위

| 영역 | Before | After |
|---|---|---|
| 백엔드 검증 | 없음 | MIME 화이트리스트 + 5MB 상한 (`FileException` 400) |
| 프론트 업로더 | `NoticeCoverUploader` / `GlobalEventCoverUploader` / `PromotionBannerUploader` 3개 | 공통 `<ImageUploader>` 하나, 호출처가 직접 사용 |
| 이미지 표시 | `<img>` 직접 + ESLint 우회 주석 (5+ 곳) | `<ImageWithFallback>` 통일 |
| 형식/용량 정책 | 클라이언트만 `accept="image/*"` | JPG/PNG/WEBP, 5MB — 프론트 + 백엔드 |

**PR 분할:**
- **PR1 (backend):** `FileController` 검증 + 인수 테스트. 독립 동작.
- **PR2 (frontend):** `<ImageUploader>` + `<ImageWithFallback>` + 호출처 교체. PR1 머지 후 시작 (백엔드 에러 메시지를 그대로 사용하므로 백엔드가 먼저 있어야 검증 가능).

## 4. 결정 사항

### 4.1 공통 컴포넌트 위치 — `apps/web/app/_components/`

`frontend/packages/ui` 신설 대신 `frontend/apps/web/app/_components/` 에 둔다.

- `frontend/packages/` 는 도메인 로직 패키지(`api`, `hooks`, `schemas`, `storage`, `stores`, `types`)만 존재한다. React 컴포넌트 전용 패키지가 없으며, 단 한 파일(`packages/hooks/src/api-context.tsx`) 만 `.tsx` 다.
- 새 `@duing/ui` 패키지를 만들려면 번들러/tsconfig path/types 빌드 파이프라인을 별도 정비해야 한다. 현재 사용처는 `apps/web` 내부 3개 도메인뿐이므로 인프라 비용에 비해 이득이 없다.
- `apps/web/app/_components/` 에는 이미 단일 앱 공용 UI 의 정착된 패턴이 있다 (`BrandMark.tsx`, `sections/Categories.tsx` 등).
- 향후 `apps/mobile` 등 추가 컨슈머가 생기면 그 시점에 `@duing/ui` 로 승격한다 (YAGNI).

**확정 위치:**
- `frontend/apps/web/app/_components/ImageUploader.tsx`
- `frontend/apps/web/app/_components/ImageWithFallback.tsx`
- `frontend/apps/web/app/_components/imageUploadPolicy.ts` (정책 상수)

### 4.2 Wrapper 컴포넌트 제거

`NoticeCoverUploader.tsx`, `GlobalEventCoverUploader.tsx`, `PromotionBannerUploader.tsx` 세 파일은 삭제한다. 호출처가 `<ImageUploader purpose="NOTICE_COVER" ... />` 형태로 직접 사용한다.

도메인별 차이는 모두 props 로 표현 가능하다 (`purpose`, `placeholder`, `altText`, `aspectRatio`). Wrapper 한 겹은 추상화 가치가 없고, 도메인 이름이 박힌 파일이 늘어날수록 새 도메인 추가 시 불필요한 보일러플레이트가 생긴다.

### 4.3 MIME 검증 한계 — 1차 방어로 한정

이번 PR 의 백엔드 검증은 `MultipartFile.getContentType()` 기반이며, 이 값은 **클라이언트가 위조할 수 있는 헤더**다. 따라서 보호 수준은 다음과 같이 한정한다.

- **차단 가능:** 정상 사용자의 실수 (GIF/BMP 업로드, 5MB 초과), 캐주얼한 우회 시도 (다른 확장자로 변경)
- **차단 불가능:** Content-Type 헤더를 의도적으로 위조한 악성 파일 (실제는 실행 파일/HTML 인데 `image/jpeg` 로 위장)

진짜 보안 경계로 끌어올리려면 별도 PR(Magic Number 기반 시그니처 검증, Apache Tika 등)이 필요하며, 이는 Out of Scope (§7) 에 명시한다.

### 4.4 `next/image` 전환 — 이번 PR 미포함

`<ImageWithFallback>` 내부 구현은 이번 PR 에서 `<img>` 를 유지한다. `next/image` 전환은 인프라 변경이므로 별도 PR.

- 현재 프로젝트의 외부 Storage URL 표시 컨벤션은 이미 `<img>` + `// next/image 도메인 화이트리스트는 후속 PR.` 주석으로 일관화되어 있다 (`NoticeCard:19`, `notices/[noticeId]/page.tsx:72`).
- `next/image` 전환은 `next.config.{ts,mjs}` 의 `images.remotePatterns` 에 Supabase Storage 도메인을 등록하고, 로컬 dev / Supabase prod / 향후 S3 등 environment matrix 를 정리하는 작업이 따라온다. 이번 PR 의 목표(중복 제거 + fallback)와 직교하므로 묶지 않는다.
- **`<ImageWithFallback>` 인터페이스는 `next/image` 전환 시에도 변경 없이 내부 구현만 교체 가능**하다. props (`src`, `alt`, `className`, fallback messages) 가 `next/image` 와 호환된다.

## 5. 백엔드 (PR1)

### 5.1 정책 상수

`backend/src/main/java/com/duing/global/file/FileUploadPolicy.java` 신설.

```java
public final class FileUploadPolicy {
    public static final long MAX_BYTES = 5L * 1024 * 1024;
    public static final Set<String> ALLOWED_MIME_TYPES = Set.of(
        "image/jpeg",
        "image/png",
        "image/webp"
    );
    private FileUploadPolicy() {}
}
```

상수만 클래스로 추출하는 이유: 인수 테스트(`FileApiTest`)에서 동일한 상수를 참조해 "5MB 정확히 통과 / 5MB + 1 byte 실패" 같은 경계 케이스를 코드 변경 없이 검증할 수 있게 하기 위함.

### 5.2 검증 로직

`FileController.upload` 진입 시점에 private 메서드로 검증한다. 별도 Validator 클래스를 만들지 않는 이유: `FileController` 가 단일 진입점이고, 검증 로직이 두 줄짜리이므로 분리는 YAGNI.

```java
@PostMapping(consumes = "multipart/form-data")
@PreAuthorize("isAuthenticated()")
public ResponseEntity<ApiResponse<FileUploadResponse>> upload(
        @RequestPart("file") MultipartFile file,
        @RequestParam("purpose") FilePurpose purpose) {
    validate(file);
    String uploadedUrl = fileStorageService.upload(file, purpose.directory());
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(ApiResponse.success(new FileUploadResponse(uploadedUrl, uploadedUrl)));
}

private void validate(MultipartFile file) {
    if (file.getSize() > FileUploadPolicy.MAX_BYTES) {
        throw new FileException.UploadSizeExceededException();
    }
    String contentType = file.getContentType();
    if (contentType == null || !FileUploadPolicy.ALLOWED_MIME_TYPES.contains(contentType)) {
        throw new FileException.UnsupportedFileTypeException();
    }
}
```

### 5.3 예외 정의

`backend/src/main/java/com/duing/global/file/exception/FileException.java` 신설 — 기존 도메인 예외 패턴(`{Domain}Exception` 부모 + static final inner class) 따름.

```java
public abstract class FileException extends BusinessException {
    protected FileException(ErrorCode errorCode) {
        super(errorCode);
    }

    public static final class UploadSizeExceededException extends FileException {
        public UploadSizeExceededException() {
            super(FileErrorCode.UPLOAD_SIZE_EXCEEDED);
        }
    }

    public static final class UnsupportedFileTypeException extends FileException {
        public UnsupportedFileTypeException() {
            super(FileErrorCode.UNSUPPORTED_FILE_TYPE);
        }
    }
}
```

`FileErrorCode` 도 같이 신설. HTTP 상태 400, 한국어 메시지:
- `UPLOAD_SIZE_EXCEEDED`: `"이미지 크기는 5MB 이하여야 합니다."`
- `UNSUPPORTED_FILE_TYPE`: `"지원하지 않는 이미지 형식입니다. (JPG, PNG, WEBP만 가능)"`

### 5.4 인수 테스트

`backend/src/test/java/com/duing/domain/file/FileApiTest.java` (도메인 패키지에 file 폴더가 없으므로 신설). RestAssured 사용, 기존 인수 테스트 패턴 따름.

검증 케이스:
1. 정상 JPG 5MB 미만 → 201 + URL 반환
2. `FileUploadPolicy.MAX_BYTES` 정확히 → 201 (경계 통과)
3. `FileUploadPolicy.MAX_BYTES + 1` → 400, 메시지 일치
4. `image/gif` 업로드 → 400
5. `image/bmp` 업로드 → 400
6. `Content-Type` 헤더 없음 → 400

테스트 파일 데이터는 `byte[]` 로 직접 생성 (실제 이미지 파일 없이 size + content-type 만 검증 가능). 인증된 사용자 토큰은 기존 `AuthFixture` 재사용.

## 6. 프론트엔드 (PR2)

### 6.1 정책 상수

`frontend/apps/web/app/_components/imageUploadPolicy.ts`.

```ts
export const IMAGE_UPLOAD_POLICY = {
  maxBytes: 5 * 1024 * 1024,
  acceptedMimes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  acceptAttribute: 'image/jpeg,image/png,image/webp',
} as const;

export type AcceptedMime = (typeof IMAGE_UPLOAD_POLICY.acceptedMimes)[number];
```

`acceptAttribute` 는 `<input type="file" accept>` 에 직접 사용. 브라우저 파일 다이얼로그가 처음부터 비호환 파일을 흐림 처리.

### 6.2 `<ImageUploader>`

`frontend/apps/web/app/_components/ImageUploader.tsx`.

```ts
type ImageUploaderProps = {
  value: string;
  onChange: (url: string) => void;
  purpose: FilePurpose;
  aspectRatio?: '16/9' | '4/3';   // default '16/9'
  placeholder?: string;            // default '이미지를 업로드하세요'
  altText?: string;                // default '대표 이미지'
};
```

**책임:**
1. 파일 선택 → 클라이언트 검증 (size, MIME) → 실패 시 inline error, 서버 요청 없이 종료.
2. 통과 시 `useFileUploadMutation` 호출 → 성공 시 `onChange(url)`.
3. 미리보기는 내부 `<ImageWithFallback>` 사용.
4. 빈 상태 / 업로드 중 / 성공 / 에러 상태를 한 컴포넌트에서 표현.

**클라이언트 검증 함수:**

```ts
function validateFile(file: File): string | null {
  if (file.size > IMAGE_UPLOAD_POLICY.maxBytes) {
    return '이미지 크기는 5MB 이하여야 합니다.';
  }
  if (!IMAGE_UPLOAD_POLICY.acceptedMimes.includes(file.type as AcceptedMime)) {
    return 'JPG, PNG, WEBP만 업로드 가능합니다.';
  }
  return null;
}
```

**에러 표시 통합:** 클라이언트 검증 에러(`localError`)와 서버 에러(`uploadMutation.error`)를 동일한 `<p className="text-red-500 text-[12px]">` 으로 노출. 서버 에러는 `ApiError.message` 를 그대로 사용 — 백엔드 한국어 메시지가 프론트에 별도 매핑 없이 표시됨.

**버튼 UX:** 기존 업로더 3종의 UX를 그대로 계승 ("업로드" / "교체" / "제거" 토글, "업로드 중…" 라벨).

### 6.3 `<ImageWithFallback>`

`frontend/apps/web/app/_components/ImageWithFallback.tsx`.

```ts
type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  emptyMessage?: string;          // default '대표 이미지 없음'
  errorMessage?: string;          // default '이미지를 불러올 수 없습니다'
};
```

**상태 머신:**
- `src` 가 `null` / `undefined` / `''` → `empty` UI (아이콘 + `emptyMessage`)
- `src` 가 있음 → 렌더, `onError` 발생 시 → `error` UI (아이콘 + `errorMessage`)
- `src` prop 이 바뀌면 상태 리셋 (`useEffect` 로 `src` watch)

**아이콘:** lucide-react 의 `ImageOff` 사용 (앱 의존성 확인 후, 없으면 인라인 SVG fallback). aria-label 으로 placeholder/error 의미 노출.

**컨테이너:** aspect ratio / 모서리 / 배경색은 부모가 `className` 으로 제어. 컴포넌트는 `absolute inset-0 grid place-items-center` 같은 내부 레이아웃만 책임.

```tsx
<div className={cn('relative bg-graysoft', className)}>
  {state === 'loaded' && <img src={src} alt={alt} className="absolute inset-0 w-full h-full object-cover" onError={...} />}
  {state === 'empty' && <FallbackUI message={emptyMessage} aria-label={emptyMessage} />}
  {state === 'error' && <FallbackUI message={errorMessage} aria-label={errorMessage} />}
</div>
```

### 6.4 호출처 마이그레이션

**업로더 교체 (3 파일 삭제 + 3 호출처 수정):**

| 삭제 | 호출처 수정 |
|---|---|
| `app/admin/notices/_components/NoticeCoverUploader.tsx` | `NoticeForm.tsx` → `<ImageUploader purpose="NOTICE_COVER" ... />` |
| `app/admin/global-events/_components/GlobalEventCoverUploader.tsx` | `AdminGlobalEventForm.tsx` → `<ImageUploader purpose="GLOBAL_EVENT_COVER" ... />` |
| `app/admin/promotions/_components/PromotionBannerUploader.tsx` | Promotion 폼 (실제 호출처 확인 필요) → `<ImageUploader purpose="PROMOTION_BANNER" ... />` |

**`<ImageWithFallback>` 적용 대상 (`<img>` + `eslint-disable @next/next/no-img-element` 패턴 제거):**

- `app/calendar/_components/EventDetailModal.tsx:107-115` (GlobalEvent 표지)
- `app/notices/_components/NoticeCard.tsx:19-25` (Notice 카드 표지)
- `app/notices/[noticeId]/page.tsx:72` (Notice 상세 표지)
- `app/admin/notices/_pages/AdminNoticeEditPage.tsx` 미리보기 영역 (확인 후 적용)
- `app/admin/promotions/_pages/...` Promotion 상세/미리보기 영역 (확인 후 적용)
- `<ImageUploader>` 내부 미리보기

**제외:**
- `app/manage/clubs/[clubId]/photos/_components/PhotoUploader.tsx` — 다중 업로드 + `createPhoto` 연쇄 mutation 로직 때문에 의미적으로 다름. 별도 PR.
- `app/_components/BrandMark.tsx`, `app/_components/sections/Categories.tsx` — 정적 자산이며 `next/image` 사용 중. 손대지 않음.

## 7. Out of Scope

이번 PR 에서는 다루지 않는다. 필요 시 별도 spec/PR.

- **Magic Number / 파일 시그니처 검증:** Apache Tika 또는 첫 N 바이트 매핑으로 실제 파일 형식 확인. MIME 헤더 위조 대응. 이번 PR 의 검증은 정상 사용자 실수 + 캐주얼 우회 차단 수준.
- **MIME spoofing 대응:** 악성 파일이 `image/jpeg` 헤더로 위장 후 실제는 실행 파일/HTML 인 케이스. 시그니처 검증과 함께 도입.
- **`next/image` 전환:** `next.config.{ts,mjs}` 의 `images.remotePatterns` 세팅, 로컬 dev / Supabase prod / 향후 S3 origin matrix 정리. 별도 인프라 PR. `<ImageWithFallback>` 인터페이스는 변경 없이 내부 구현만 교체 가능.
- **Storage orphan cleanup:** 이미지 교체/제거 시 이전 Supabase Storage 객체가 그대로 남는 문제. `storage_key` 추적 + cleanup 잡(또는 onUpdate 즉시 삭제).
- **이미지 자동 압축/리사이징:** 클라이언트 sharp/wasm 또는 서버 이미지 파이프라인.
- **해상도 제약:** 최소/최대 해상도 검증. UX 안내만 있어도 충분하다는 1차 정책.
- **PhotoUploader 통합:** 다중 업로드 + `createPhoto` mutation 연쇄. 별도 PR.
- **안티-바이러스 스캐닝, `X-Content-Type-Options: nosniff` 응답 헤더:** 인프라 레벨 강화.

## 8. 테스트 전략

### 백엔드 (PR1)

- `FileApiTest` 인수 테스트 6 케이스 (§5.4).
- `FileUploadPolicy` 상수 변경 시 테스트가 같이 따라가도록 상수 참조.

### 프론트엔드 (PR2)

- `ImageUploader.test.tsx`:
  - 5MB + 1 byte 파일 → 서버 요청 없이 inline error.
  - `image/gif` 파일 → inline error.
  - 정상 파일 → `onChange(url)` 호출.
- `ImageWithFallback.test.tsx`:
  - `src=null` → empty UI.
  - `src=''` → empty UI.
  - `src` 있음 + img onError → error UI.
  - `src` prop 변경 → 상태 리셋.

`useFileUploadMutation` 자체는 mock 하지 않는다 (TanStack Query 내부 모킹 금지 — `frontend/CLAUDE.md`). MSW 로 `/api/v1/files` 응답을 가로채는 방식 또는 컴포넌트 props 로 API 클라이언트 주입.

## 9. 데이터 흐름

```
[User] -- select file -->
[ImageUploader]
  ├─ client validate (size, MIME)
  │   ├─ fail → inline error (no network)
  │   └─ pass
  └─ useFileUploadMutation -->
      [Backend FileController]
        ├─ validate (size, MIME)
        │   ├─ fail → 400 + 한국어 메시지 → ApiError → inline error
        │   └─ pass
        └─ FileStorageService.upload --> Storage URL
            └─ onChange(url) → form state
```

표시:
```
[Detail Page] -- coverImageUrl -->
[ImageWithFallback]
  ├─ null/empty → empty placeholder
  ├─ load OK → <img>
  └─ onError → error placeholder
```

## 10. 마이그레이션 절차 요약

1. PR1: 백엔드 정책 상수 + 검증 + 예외 + 인수 테스트 → develop 머지.
2. PR2: 프론트 정책 상수 + `<ImageUploader>` + `<ImageWithFallback>` 신설 → 3 wrapper 삭제 + 호출처 교체 + 표시처 교체 → develop 머지.

PR2 작업 시 백엔드(PR1) 가 이미 develop 에 있어야 양쪽 검증 메시지 정합성을 확인할 수 있다.