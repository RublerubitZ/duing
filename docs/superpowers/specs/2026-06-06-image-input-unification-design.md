# 이미지 입력 통일 (URL → ImageUploader) 설계

> **작성일:** 2026-06-06
> **상태:** 설계 승인 대기
> **분할:** 단일 PR (backend FilePurpose 1 줄 + frontend 5 파일)
> **선행 PR:** #248 (백엔드 파일 검증), #249 (ImageUploader / ImageWithFallback 도입)

## 1. 배경

#248 / #249 으로 GlobalEvent · Notice · Promotion 도메인의 이미지 등록은 `<ImageUploader>` 기반 파일 업로드로 통일되었다. 사용자가 직접 URL 을 입력하던 wrapper 들이 모두 제거되어 한 곳 (`<ImageUploader purpose="...">`) 으로 수렴했다.

그러나 전수조사 결과 다음 4 사용처가 여전히 `<input type="url">` 으로 이미지 URL 을 직접 입력받고 있다.

| # | 사용처 | 필드 | 흐름 |
|---|---|---|---|
| 1 | `admin/clubs/new/_components/AdminClubCreateForm.tsx:181` | `logoUrl` | 관리자 동아리 신규 생성 |
| 2 | `manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx:286` | `logoUrl` | 운영진 동아리 정보 편집 (로고) |
| 3 | `manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx:298` | `coverUrl` | 운영진 동아리 정보 편집 (커버) |
| 4 | `manage/clubs/[clubId]/_components/PromotionRequestModal.tsx:159` | `suggestedBannerImageUrl` | 운영진의 홍보 요청 (제안 배너) |

이 외 6 곳의 `<input type="url">` 은 외부 링크용 (`linkUrl` / `externalFormUrl` / SNS / `suggestedLinkUrl`) 으로 이미지 URL 이 아니다. 본 spec 범위 밖.

## 2. 목표

프로젝트 전체에서 **사용자가 이미지 URL 을 직접 입력하는 화면을 0 개로 만든다.** 모든 이미지 입력은 `<ImageUploader>` → Supabase Storage 흐름으로 통일.

성공 조건: 위 4 사용처가 모두 `<ImageUploader>` 로 치환되고, `grep -rn '"url".*logoUrl\|"url".*coverUrl\|"url".*ImageUrl\|"url".*BannerImageUrl' frontend/apps/web/app` 결과가 0 건.

## 3. 변경 범위

### 3.1 백엔드 (1 파일 1 줄)

`backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java` 에 enum 값 한 줄 추가.

```java
PROMOTION_REQUEST_BANNER("promotion-request/banner"),
```

기존 `LOGO("club/logo")` / `COVER("club/cover")` / `PROMOTION_BANNER("promotion/banner")` 등은 그대로 사용. Club logo/cover 는 새 enum 이 필요 없다.

### 3.2 타입 패키지 (1 줄)

`frontend/packages/types/src/club.ts` 의 `FilePurpose` union 에 추가:

```ts
export type FilePurpose =
  | 'LOGO'
  | 'COVER'
  | 'PHOTO'
  | 'NOTICE_COVER'
  | 'PROMOTION_BANNER'
  | 'GLOBAL_EVENT_COVER'
  | 'PROMOTION_REQUEST_BANNER';   // 추가
```

### 3.3 ImageUploader aspectRatio 확장

`frontend/apps/web/app/_components/ImageUploader.tsx`.

기존:
```ts
aspectRatio?: '16/9' | '4/3';   // default '16/9'

const ASPECT_CLASS: Record<NonNullable<Props['aspectRatio']>, string> = {
  '16/9': 'aspect-[16/9]',
  '4/3': 'aspect-[4/3]',
};
```

변경 후:
```ts
aspectRatio?: '1/1' | '16/9' | '4/3';   // default '16/9'

const ASPECT_CLASS: Record<NonNullable<Props['aspectRatio']>, string> = {
  '1/1': 'aspect-square',
  '16/9': 'aspect-[16/9]',
  '4/3': 'aspect-[4/3]',
};
```

기본값(`16/9`) 은 유지되어 기존 호출처(Notice/GlobalEvent/Promotion cover) 영향 없음.

### 3.4 프론트 호출처 4 곳

#### (1) AdminClubCreateForm.tsx

기존 `<Field label="로고 URL">` + `<input type="url" value={logoUrl} ...>` 블록(라벨 + input + placeholder) 을 전체 교체:

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

- `logoUrl` state, 제출 시 `logoUrl.trim() || undefined` 변환 로직은 기존 그대로 유지.
- 기존 검증 (`'로고 URL은 500자 이하여야 합니다.'`) 은 Storage URL 도 500자 이내이므로 그대로 두되 메시지 문구만 `'로고 이미지 URL은 500자 이하여야 합니다.'` 로 정리 (또는 제거 — 어차피 Storage URL 은 500자 이내).
- `import { ImageUploader } from '../../../_components/ImageUploader';` 추가.

#### (2)(3) ClubInfoForm.tsx — logoUrl + coverUrl

두 블록을 동일 패턴으로 교체.

```tsx
<div className={fieldCls}>
  <label className={labelCls}>로고 이미지</label>
  <ImageUploader
    value={logoUrl}
    onChange={setLogoUrl}
    purpose="LOGO"
    aspectRatio="1/1"
    placeholder="로고 이미지를 업로드하세요"
    altText="로고"
  />
</div>

<div className={fieldCls}>
  <label className={labelCls}>커버 이미지</label>
  <ImageUploader
    value={coverUrl}
    onChange={setCoverUrl}
    purpose="COVER"
    aspectRatio="16/9"
    placeholder="커버 이미지를 업로드하세요"
    altText="커버"
  />
</div>
```

- 기존 `setLogoUrl` / `setCoverUrl` state setter 그대로 사용.
- 제출 payload 분기 (`payload.logoUrl = logoUrl || null`) 로직 그대로.
- `htmlFor="f-logo"` / `htmlFor="f-cover"` 는 ImageUploader 가 자체 `<input>` 을 숨기고 있어 더 이상 의미 없음 → 라벨에서 제거.

#### (4) PromotionRequestModal.tsx — suggestedBannerImageUrl

이 파일은 react-hook-form 의 `register('suggestedBannerImageUrl')` 패턴을 사용한다. `<ImageUploader>` 는 controlled value/onChange 패턴이므로 `useController` 또는 `setValue` 로 전환 필요.

권장 방식: `useController` (가장 명시적).

```tsx
import { useController } from 'react-hook-form';

// 컴포넌트 내부
const { field: bannerField } = useController({
  control,
  name: 'suggestedBannerImageUrl',
  defaultValue: '',
});

// 기존 label + input 블록 교체
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
</div>
```

- `control` 은 이미 `useForm` 에서 받고 있을 가능성 큼 (없으면 추가).
- 기존 zod 스키마 (`suggestedBannerImageUrl: z.string().max(500).optional().or(z.literal(''))` 추정) 그대로 사용 — Storage URL 도 500자 이내.

## 4. 기존 외부 URL 데이터 처리

DB 에 이미 저장된 외부 URL (예: `https://imgur.com/abc.png`) 은 그대로 유지된다. 점진 마이그레이션:

**표시:**
- ClubCard / ClubDetailHero / 기타 콘텐츠 표시처는 #249 의 `ImageWithFallback` 으로 그대로 렌더 (load 성공 / 실패 시 fallback)
- 이미 외부 도메인 (imgur 등) 의 이미지가 잘 로딩되고 있다면 그대로 표시됨

**수정 폼 진입:**
- `<ImageUploader value={detail.logoUrl ?? ''} ...>` 에 외부 URL 이 그대로 들어가 미리보기로 노출됨
- 사용자가 **"교체"** 클릭 → Supabase Storage 로 업로드 → `onChange(newStorageUrl)` → 폼 state 가 Storage URL 로 교체 → 저장 시 DB 업데이트
- **"제거"** 클릭 → `onChange('')` → 저장 시 null

배치 마이그레이션 잡은 만들지 않는다 — 운영진이 자기 동아리 정보를 수정할 때마다 한 건씩 자동 전환되는 자연스러운 점진 마이그레이션.

## 5. 데이터 흐름

```
[DB 에 외부 URL 이 남아있는 경우]
DB.club.logoUrl = 'https://imgur.com/x.png'
  ↓ 표시
ClubCard / ClubDetailHero → <img>/ImageWithFallback (load OK 시 그대로 표시)
  ↓ 수정 폼 진입
ClubInfoForm.logoUrl state = 'https://imgur.com/x.png'
  ↓ value prop
<ImageUploader value="https://imgur.com/x.png" .../>
  ↓ 미리보기 (ImageWithFallback 내부)
사용자가 "교체" → 파일 선택 → POST /api/v1/files?purpose=LOGO
  → FileController.validate (5MB / JPG·PNG·WEBP)
  → Supabase Storage upload (directory: 'club/logo')
  → 응답 url 반환
  ↓ onChange(newUrl)
ClubInfoForm.logoUrl state = '<supabase>/club/logo/...'
  ↓ 폼 제출 PATCH /clubs/{id}/info
  → Club.update(payload) 의 기존 흐름 (logoUrl != null 이면 갱신)
  → DB.club.logoUrl 업데이트 완료
```

## 6. 테스트 전략

### 6.1 프론트 단위 테스트

- `AdminClubCreateForm.test.tsx`
  - `<ImageUploader>` mock 설치 후 `purpose="LOGO"` / `aspectRatio="1/1"` 가 전달되는지
  - 초기 `logoUrl` 이 빈 문자열로 시작하는지
  - mock 의 onChange 호출 시 폼 state 가 갱신되는지

- `ClubInfoForm.test.tsx`
  - logo / cover 두 ImageUploader 가 각각 올바른 purpose + aspectRatio 로 렌더
  - 초기 외부 URL (`detail.logoUrl = 'https://imgur.com/...'`) 이 value 로 전달되는지
  - 변경 후 제출 payload 의 `logoUrl` / `coverUrl` 이 새 값으로 들어가는지

- `PromotionRequestModal.test.tsx`
  - `<ImageUploader>` mock 의 onChange 호출 시 react-hook-form 의 `suggestedBannerImageUrl` 필드가 setValue 되는지
  - 제출 시 새 URL 이 mutation 으로 전달되는지

- `ImageUploader.test.tsx` — 1 케이스 추가
  - `aspectRatio="1/1"` 전달 시 컨테이너에 `aspect-square` 클래스가 적용되는지

### 6.2 백엔드

- `FileApiTest` 에 1 케이스 추가
  - `purpose=PROMOTION_REQUEST_BANNER` 로 정상 JPG 업로드 → 201 + URL 응답
  - StubFileStorageService 가 `promotion-request/banner` directory 를 받는지 (StubFileStorageService 의 `upload(file, directory)` 반환 URL 에 directory 가 포함됨)

## 7. 리스크 & 롤백

| 리스크 | 완화 |
|---|---|
| 기존 외부 URL 표시 실패 (외부 도메인 다운) | `ImageWithFallback` 의 onError → fallback 메시지 (PR #249 에서 도입됨) |
| `<input type="url">` 제거로 사용자가 URL 직접 입력 불가 (의도된 변경) | 라벨/플레이스홀더 문구 정리 — "URL" 단어 제거. ImageUploader 의 미리보기 + 업로드 버튼이 직관적 |
| `PROMOTION_REQUEST_BANNER` enum 추가로 backend ↔ frontend 동시 배포 필요 | 단일 PR 안에 backend FilePurpose + frontend types 모두 포함 |
| react-hook-form 의 `register` → `useController` 전환 시 검증 오작동 | `PromotionRequestModal.test.tsx` 회귀 케이스 + 기존 zod 스키마 그대로 사용 |
| PromotionRequest 가 임시 자료 (제안 단계) 인데 Storage 용량 점유 | 본 spec scope 밖 — Storage orphan cleanup 은 별도 spec |

**롤백:** 단일 PR revert. DB 스키마 변경 없으므로 데이터 손실 0. 외부 URL 이 일부 남아있어도 표시 측은 계속 동작.

## 8. Out of Scope

본 spec 에서는 다루지 않는다.

- **PhotoUploader 통합** — `manage/clubs/[clubId]/photos` 의 멀티 업로드 + `createPhoto` 연쇄 mutation 로직 때문에 의미상 다름. 별도 spec.
- **외부 링크 URL 입력** — `linkUrl` (notice/global-event/promotion), `externalFormUrl` (recruitment 외부 폼), SNS 링크, `suggestedLinkUrl`. 의미상 외부 링크이므로 보존.
- **외부 URL → Storage 일괄 마이그레이션 배치 잡** — 점진 마이그레이션 채택.
- **로고 원형 마스크 / 동적 cropper UI** — `aspectRatio="1/1"` 만 적용, crop 기능 미구현.
- **`next/image` 전환** — 이전 spec (`2026-06-05-image-upload-consolidation-design.md`) 의 Out of Scope 유지.
- **Magic Number 기반 파일 시그니처 검증** — 동일 사유.
- **Storage orphan cleanup** — 이미지 교체/제거 시 이전 Storage 객체 cleanup. 별도 spec.
- **다른 도메인 `<input type="url">`** — 외부 링크 URL 은 모두 유지 (목표가 "이미지 URL 입력 0개" 이지 "URL 입력 0개" 가 아님).

## 9. 마이그레이션 절차 요약

1. 백엔드 `FilePurpose` enum 에 `PROMOTION_REQUEST_BANNER` 추가
2. 프론트 `@duing/types` 의 `FilePurpose` union 에 동일 값 추가
3. `ImageUploader` aspectRatio 에 `'1/1'` 추가
4. 4 호출처를 순차로 마이그레이션:
   - AdminClubCreateForm (logoUrl)
   - ClubInfoForm (logoUrl + coverUrl)
   - PromotionRequestModal (suggestedBannerImageUrl)
5. 각 호출처별 단위 테스트 업데이트
6. `FileApiTest` 에 PROMOTION_REQUEST_BANNER 케이스 1 개 추가
7. 빌드 + 전체 테스트 + 수동 dev 확인 (4 화면)
8. 단일 PR 머지

성공 확인:
```
grep -rn 'type="url"' frontend/apps/web/app --include="*.tsx" \
  | grep -iE 'logoUrl|coverUrl|imageUrl|bannerImageUrl'
```
→ 0 건 출력.
