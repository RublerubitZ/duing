# 배너 공지 연결 설계 사양 (Issue #8)

작성일: 2026-06-07
대상 도메인: `backend/domain/promotion/**` / `frontend/apps/web/app/admin/promotions/**` / `frontend/apps/web/app/_components/sections/BannerCarousel.tsx`
선행 사양:
- `2026-06-07-promotion-full-bleed-image-design.md` (PR1~3 머지 완료)
- `2026-06-07-promotion-banner-ux-refinements-design.md` (PR #281)
- `2026-06-07-promotion-banner-clickability-design.md` (Issue #7, 선행 머지 가정)

---

## 1. 배경

현재 Promotion 의 클릭 대상은 `linkUrl` (TEXT) + `clubId` (FK) 두 가지뿐. 실사용에서는 **공지(notice) 로 직접 연결** 하는 경우가 더 빈번할 것으로 예상 — 모집 공고/행사 안내/동아리 공지 등.

Notice 도메인은 이미 운영 중 (`Notice` entity, `NoticeVisibility = PUBLIC / OFFICERS_ALL / CLUB_SCOPED`, soft-delete). 어드민 검색 hook (`useAdminNoticeListQuery`) 와 상세 페이지(`/notices/{id}`) 모두 존재.

---

## 2. 목표 / Non-목표

### 2.1 목표
- Promotion 에 `notice_id` 컬럼 추가 — URL / 공지 / 동아리 중 **최대 1개** 연결 가능.
- 어드민 폼에서 \"연결 대상\" 라디오 UX (NONE / EXTERNAL_URL / NOTICE / CLUB) 도입. 기존 `isCuration` 체크박스 제거.
- 공개 피드 응답에서 연결된 공지의 가시성을 더블 체크해 비공개/삭제 공지는 무효화.
- Spec #7 의 `resolvePromotionHref` helper 에 NOTICE 분기 한 줄 추가.
- AdminPromotionResponse 에 **derived `linkType` enum 필드** 추가 — 프론트 edit 모드 초기화 단순화.

### 2.2 Non-목표 (Out of Scope)
- 백엔드의 \"자동 비활성화\" 트리거/이벤트 — 공지 삭제 시 배너 active=false 자동 변환은 도입하지 않음. 운영자 수동 처리 + UI 경고.
- PromotionCardResponse 에 `linkType` 추가 — 공개 응답은 priority chain 으로 href derive 충분 (YAGNI).
- Notice 의 검색 API 신규 — 기존 `useAdminNoticeListQuery` 그대로 활용.
- `CURATION_LABEL = '큐레이션'` (어드민 목록 라벨) 변경 — `promotion.club ? club.name : '큐레이션'` 의미가 새 linkType 와 일치 (CLUB 외에는 club null), 시각 변경 zero.
- 공개 피드 자체에서 \"공지 무효화된 배너\" 행을 누락시키는 것 — 데이터는 응답하되 `notice.isAccessible=false` 로 표시. 프론트가 href=null 으로 비인터랙티브 렌더 (Spec #7).
- 모드 토글 데이터 보존 — 본 spec 의 라디오 토글은 \"링크 유형 전환\" 이라 다른 유형의 입력값 자동 클리어가 의도. spec §6.2 (선행 refinements) 의 \"입력 UI 보존\" 정책과 다른 의미 (그건 SYSTEM/FULL_BLEED 토글).

---

## 3. 데이터 모델

### 3.1 Flyway V42

```sql
-- V42__alter_promotion_add_notice_link.sql
-- promotion: 공지 연결 지원. link_url / notice_id / club_id 중 ≤1 만 set.

ALTER TABLE promotion
    ADD COLUMN notice_id BIGINT REFERENCES notice(id);

ALTER TABLE promotion
    ADD CONSTRAINT chk_promo_single_link CHECK (
        (CASE WHEN link_url IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN notice_id IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN club_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );

-- 어드민 목록 / 공개 피드의 notice JOIN 가속 인덱스.
CREATE INDEX idx_promo_notice_id ON promotion (notice_id) WHERE notice_id IS NOT NULL AND deleted_at IS NULL;
```

선행 V40 (`chk_promo_schedule_range`) / V41 (`chk_promo_render_mode`) 에서 검증된 Postgres CHECK 제약 패턴 그대로. CASE WHEN 산술도 표준 SQL.

### 3.2 Pre-flight 검증 (마이그레이션 실행 전)

V42 적용 전 다음 SQL 로 기존 데이터 무결성 확인 — 0 row 가 나오지 않으면 ALTER 가 실패하므로 사전 정리 필수:

```sql
SELECT id, club_id, link_url
FROM promotion
WHERE deleted_at IS NULL
  AND link_url IS NOT NULL
  AND club_id IS NOT NULL;
```

존재 시 운영자가 어떤 연결을 우선시할지 결정 후 한쪽 null 처리. 본 spec 의 plan 단계에서 \"pre-flight 검증 SQL 실행\" 을 별도 step 으로 명시한다.

### 3.3 Promotion entity 변경

```java
@Column(name = "notice_id") private Long noticeId;
```

위치는 `clubId` 다음 (의미 그루핑 — 둘 다 외부 entity FK). `UpdatePayload` 도 `noticeId` + `clearNoticeId` 추가.

`Promotion.create()` 시그니처에 `noticeId` 추가:
```java
public static Promotion create(
    Long clubId, String title, ..., Long noticeId, ...);
```

`update()` 본문에 분기:
```java
if (Boolean.TRUE.equals(payload.clearNoticeId())) this.noticeId = null;
else if (payload.noticeId() != null) this.noticeId = payload.noticeId();
```

---

## 4. 백엔드 검증

### 4.1 DB CHECK (last-resort 무결성)
§3.1 의 `chk_promo_single_link`. 모든 update/insert 가 이를 통과해야 함.

### 4.2 Service-level Validator (친절한 422)
DB CHECK 만 의존하면 violation 시 에러 메시지가 Postgres 영문이 그대로 노출됨. Service create/update 시작부에서 명시 검증:

```java
if (countSetLinks(command) > 1) {
  throw new PromotionException.MultipleLinkTargetsException(
      "링크 대상은 외부 URL / 공지 / 동아리 중 하나만 선택 가능합니다."
  );
}
```

`countSetLinks` = `linkUrl != null` + `noticeId != null` + `clubId != null` 셈.

새 예외:
```java
public static class MultipleLinkTargetsException extends PromotionException {
  public MultipleLinkTargetsException(String message) { super(message, HttpStatus.UNPROCESSABLE_ENTITY); }
}
```

### 4.3 Notice 존재성 + 가시성 검증 (저장 시점)

Service create/update 의 noticeId 처리 분기:
1. noticeId 가 명시되었으면 NoticeRepository 로 fetch
2. 존재하지 않으면 `NoticeException.NoticeNotFoundException` (404)
3. `visibility != PUBLIC` 이면 신규 `PromotionException.NonPublicNoticeLinkException` (422):
   `"공지 배너 연결은 공개 공지(PUBLIC) 만 가능합니다."`
4. soft-delete (`deleted_at IS NOT NULL`) 는 NoticeRepository 의 `@SQLRestriction` 이 이미 필터하므로 fetch 자체가 실패 → (2) 와 동일 처리

→ NoticeSelector 가 PUBLIC 만 보여줘도 어드민이 폼 안에서 일정 조작(예: URL 직접 호출) 으로 우회 가능하므로 서버 검증 필수.

### 4.4 Request DTO cross-field `@AssertTrue`

`CreatePromotionRequest` / `UpdatePromotionRequest` 에 추가:

```java
@AssertTrue(message = "링크 대상은 외부 URL / 공지 / 동아리 중 하나만 선택 가능합니다.")
public boolean isSingleLinkTarget() {
  int count = 0;
  if (linkUrl != null && !linkUrl.isBlank()) count++;
  if (noticeId != null) count++;
  if (clubId != null) count++;
  return count <= 1;
}
```

Bean Validation 단에서 차단되면 Service 까지 도달하지 않음 — Service Validator 는 이중 안전망.

---

## 5. 응답 DTO

### 5.1 PromotionLinkType enum (신규)

```java
public enum PromotionLinkType {
    NONE, URL, NOTICE, CLUB
}
```

위치: `backend/.../domain/promotion/entity/PromotionLinkType.java` (다른 promotion enum 들과 동일 폴더).

### 5.2 AdminPromotionResponse 확장

```ts
{
  // ... 기존 필드들
  club: { id, name } | null;
  notice: { id, title, visibility, isAccessible } | null;  // 신규
  linkType: 'NONE' | 'URL' | 'NOTICE' | 'CLUB';            // 신규 — 백엔드 derived
}
```

백엔드 `of(Promotion)` 정적 메서드에서:
```java
PromotionLinkType linkType =
    promotion.getLinkUrl() != null ? PromotionLinkType.URL :
    promotion.getNoticeId() != null ? PromotionLinkType.NOTICE :
    promotion.getClubId() != null ? PromotionLinkType.CLUB :
    PromotionLinkType.NONE;
```

`notice` 객체는 NoticeRepository fetch 후:
- `visibility=PUBLIC AND deleted_at IS NULL` → `isAccessible=true`
- 그 외 → `isAccessible=false`
- Notice 존재하지 않으면 `notice = null` (이는 FK 무결성상 발생 안 해야 하지만 안전망)

### 5.3 PromotionCardResponse 확장

```ts
{
  // ... 기존 필드들
  club: { id, name } | null;
  notice: { id, title, isAccessible } | null;  // 신규 (visibility 는 공개 응답에서 노출 안 함)
}
```

`linkType` 은 공개 응답에 **포함하지 않는다** — 프론트 mapper 의 `resolvePromotionHref` 가 priority chain 으로 derive 충분.

**Title 누출 방지**: `isAccessible=false` 인 공지 (비공개 또는 soft-deleted) 는 공개 응답의 `notice.title` 자리에 **빈 문자열을 채운다**. id 와 isAccessible 만 의미를 갖고, 프론트 mapper 는 isAccessible=false 면 어차피 href 분기에서 건너뜀 → title 을 사용할 일 없음. 비공개 공지 제목이 공개 API 응답에 노출되는 사고 방지.

(AdminPromotionResponse 는 어드민 전용이므로 `title` 그대로 노출 — 운영자가 \"어떤 공지가 연결됐었는지\" 확인 가능해야 다른 공지로 교체할 수 있다.)

### 5.4 PromotionAdminListQuery

`noticeId` 필드 추가 + Service 의 listForAdmin 에서 noticeRepository batch fetch (clubMap / userMap 과 동일 패턴):

```java
Map<Long, Notice> noticeMap = noticeRepository.findAllById(noticeIds).stream()
    .collect(Collectors.toMap(Notice::getId, Function.identity()));
```

→ 어드민 목록 N+1 zero.

---

## 6. 가시성 더블 체크 (저장 시 + 조회 시)

### 6.1 저장 시점
§4.3 의 \"Notice 존재성 + visibility=PUBLIC + not deleted\" 검증.

### 6.2 조회 시점
공개 피드 `findPublic`:
- 기존: `PromotionRepository.findPublicActive(pageable)` — active + (startAt 통과) + (endAt 미통과) 필터
- 신규: 그대로 두되, Service 에서 매핑 시 각 Promotion 의 noticeId 가 있으면 Notice fetch → visibility/deleted 확인 → `isAccessible` 도출
- 응답의 `notice.isAccessible=false` 면 프론트 `resolvePromotionHref` 가 그 분기를 건너뜀 → href=null → Spec #7 비인터랙티브 렌더

어드민 응답도 동일 (`visibility` 도 같이 노출).

---

## 7. 공개 렌더 (Spec #7 helper 확장)

```ts
function resolvePromotionHref(promotion: PromotionCard): string | null {
  if (promotion.linkUrl) return promotion.linkUrl;
  if (promotion.notice?.isAccessible) return `/notices/${promotion.notice.id}`;  // ← Spec #8 추가
  if (promotion.club) return `/clubs/${promotion.club.id}`;
  return null;
}
```

순서: URL > NOTICE > CLUB > null. DB CHECK 가 ≤1 강제하므로 실제 우선순위 충돌 zero.

---

## 8. 어드민 폼 UI

### 8.1 FormState 변경

**제거:** `isCuration: boolean`

**신규:**
```ts
linkType: 'NONE' | 'EXTERNAL_URL' | 'NOTICE' | 'CLUB';
noticeId: number | null;
noticeTitle: string | null;
```

기존 `clubId`, `clubName`, `linkUrl` 은 유지. 새 `linkType` 가 \"어느 필드가 의미 있는지\" 의 상태머신 역할.

### 8.2 buildInitialState

create 모드: `linkType: 'NONE'`, `noticeId: null`, `noticeTitle: null`
edit 모드: AdminPromotionResponse 의 `linkType` 그대로 사용 + `notice.id` / `notice.title` 채움

`isCuration: initialValues.club === null` 라인 제거.

### 8.3 라디오 그룹 UI

`<Field label="제목 ...">` 다음, 배너 이미지 섹션 위에 삽입:

```tsx
<div className="space-y-2">
  <span className="block text-[12.5px] font-semibold text-charcoal-2">연결 대상</span>
  <div className="flex flex-col gap-2 text-[13.5px]">
    {(['NONE', 'EXTERNAL_URL', 'NOTICE', 'CLUB'] as const).map((type) => (
      <label key={type} className="inline-flex items-center gap-2">
        <input
          type="radio"
          name="linkType"
          checked={state.linkType === type}
          onChange={() => handleLinkTypeChange(type)}
        />
        {LINK_TYPE_LABEL[type]}
      </label>
    ))}
  </div>
</div>
```

`LINK_TYPE_LABEL` 매핑:
- `NONE`: '연결 안 함 — 클릭 불가 배너'
- `EXTERNAL_URL`: '외부/내부 URL'
- `NOTICE`: '공지 연결'
- `CLUB`: '동아리 연결'

### 8.4 동적 입력 UI

라디오 선택에 따라:

```tsx
{state.linkType === 'EXTERNAL_URL' && (
  <Field label="링크 URL (≤2000자)">
    <input type="url" value={state.linkUrl} ... />
  </Field>
)}
{state.linkType === 'NOTICE' && (
  <Field label="공지 선택">
    <NoticeSelector
      selectedNoticeId={state.noticeId}
      selectedNoticeTitle={state.noticeTitle}
      onSelect={(id, title) => setState(prev => ({ ...prev, noticeId: id, noticeTitle: title }))}
      onClear={() => setState(prev => ({ ...prev, noticeId: null, noticeTitle: null }))}
    />
    {/* edit 모드 경고 — 비인덱서블 공지 */}
    {props.mode === 'edit'
      && state.linkType === 'NOTICE'
      && state.noticeId !== null
      && props.initialValues.notice?.id === state.noticeId
      && props.initialValues.notice?.isAccessible === false && (
        <p className="mt-1 text-[12px] text-amber-600">
          연결된 공지가 비공개/삭제 상태입니다. 다시 선택하거나 다른 연결을 골라주세요.
        </p>
    )}
  </Field>
)}
{state.linkType === 'CLUB' && (
  <ClubSelector ... />
)}
```

### 8.5 handleLinkTypeChange — 다른 유형 입력값 자동 클리어

```ts
function handleLinkTypeChange(next: LinkType) {
  setState((prev) => ({
    ...prev,
    linkType: next,
    // 선택한 type 이 아닌 입력값 클리어
    linkUrl: next === 'EXTERNAL_URL' ? prev.linkUrl : '',
    noticeId: next === 'NOTICE' ? prev.noticeId : null,
    noticeTitle: next === 'NOTICE' ? prev.noticeTitle : null,
    clubId: next === 'CLUB' ? prev.clubId : null,
    clubName: next === 'CLUB' ? prev.clubName : null,
  }));
}
```

선행 refinements spec §8 의 \"보존 정책\" 과 의도적으로 다름 — \"링크 유형 전환\" 은 \"표시 모드 토글\" 과 달리 의도 자체가 갈리는 작업이고, DB CHECK 와 일치시키기 위해 자동 클리어가 자연스럽다.

### 8.6 submit 매핑

```ts
const linkUrlValue = state.linkType === 'EXTERNAL_URL' ? trimToNull(state.linkUrl) : null;
const noticeIdValue = state.linkType === 'NOTICE' ? state.noticeId : null;
const clubIdValue = state.linkType === 'CLUB' ? state.clubId : null;
```

create payload: `linkUrl`, `noticeId`, `clubId` 그대로 전송.
update payload: 기존 패턴(assign-or-clear) 그대로 — null 이고 originalValue 가 있었으면 clear 플래그, 값 있으면 직접.

---

## 9. 권한 / 삭제 정책

| 시나리오 | 동작 |
|---------|------|
| 어드민이 PUBLIC 외 공지 선택 시도 | NoticeSelector 가 PUBLIC 만 노출. 우회해서 호출 시 백엔드 422 (`NonPublicNoticeLinkException`). |
| 어드민이 동시에 URL+공지 입력 (라디오 우회) | Request `@AssertTrue isSingleLinkTarget()` → 422. Service Validator 가 한 번 더 가드. DB CHECK 가 last-resort. |
| 연결된 공지가 비공개 전환 | 배너 active 그대로 유지, 어드민 응답 `notice.isAccessible=false`. 공개 응답 동일. 프론트는 href=null → 비인터랙티브. 어드민 edit 폼에서 경고 표시. |
| 연결된 공지가 soft-delete | NoticeRepository `@SQLRestriction` 으로 fetch 실패 → 응답 `notice=null`. 프론트 mapper 가 club / linkUrl 폴백 시도 (CHECK 에 의해 둘 다 null) → href=null. 어드민 edit 폼은 \"공지 정보를 찾을 수 없음 — 다시 선택해주세요\" 같은 메시지. |

→ \"배너 자동 비활성화\" 정책은 채택하지 않음. 운영자 수동 정리 + UI 가이드로 충분.

---

## 10. NoticeSelector 컴포넌트 (신규)

`ClubSelector.tsx` 패턴 그대로:

- 위치: `frontend/apps/web/app/admin/promotions/_components/NoticeSelector.tsx`
- props: `{ selectedNoticeId, selectedNoticeTitle, onSelect, onClear }`
- 내부:
  - `useDebouncedValue(query, 250)`
  - `useAdminNoticeListQuery({ keyword, visibility: 'PUBLIC', page: 0, size: 8 })`
  - 선택됨 → 칩 (title + ID + \"변경\" 버튼)
  - 미선택 → typeahead input + 드롭다운 (검색 결과 ≤8, \"검색 결과 없음\" fallback)

`useAdminNoticeListQuery` 가 `visibility` 파라미터를 지원하지 않으면 해당 파라미터 추가도 본 PR 에 포함.

---

## 11. 영향 파일

### 11.1 백엔드 (~10 파일)
| Action | Path |
|--------|------|
| Create | `backend/src/main/resources/db/migration/V42__alter_promotion_add_notice_link.sql` |
| Create | `backend/src/main/java/com/duing/domain/promotion/entity/PromotionLinkType.java` |
| Modify | `Promotion.java` (필드, Builder, create, UpdatePayload, update) |
| Modify | `CreatePromotionRequest.java` (noticeId 필드, `@AssertTrue isSingleLinkTarget`) |
| Modify | `UpdatePromotionRequest.java` (noticeId + clearNoticeId, 동일 검증) |
| Modify | `CreatePromotionCommand.java` / `UpdatePromotionCommand.java` |
| Modify | `GeneralPromotionService.java` (NoticeRepository 주입, 검증, 매핑) |
| Modify | `AdminPromotionResponse.java` (notice, linkType derived) |
| Modify | `PromotionCardResponse.java` (notice) |
| Modify | `PromotionAdminListQuery.java` (noticeId) |
| Modify | `PromotionException.java` (`MultipleLinkTargetsException`, `NonPublicNoticeLinkException`) |
| Modify | `api/AdminPromotionApi.java` (springdoc 자동, 별도 변경 없음 가능) |
| Modify | 백엔드 테스트 (entity + service + Validator) |

### 11.2 프론트 (~6 파일)
| Action | Path |
|--------|------|
| Modify | `frontend/packages/types/src/admin.ts` (PromotionLinkType union, AdminPromotionSummary.notice/linkType, Create/UpdatePromotionPayload.noticeId/clearNoticeId, PromotionCard.notice) |
| Create | `frontend/apps/web/app/admin/promotions/_components/NoticeSelector.tsx` |
| Modify | `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx` (FormState linkType, 라디오 UI, 동적 입력, submit 매핑) |
| Modify | `frontend/apps/web/app/_components/sections/BannerCarousel.tsx` (resolvePromotionHref 에 notice 분기) |
| Modify | RTL 테스트 — `admin-promotion-form-render-mode.test.tsx` 또는 신규 `admin-promotion-form-link-type.test.tsx` (라디오 토글 + NoticeSelector + 경고 표시) |
| (조건부) Modify | `frontend/packages/hooks/src/notices.ts` (`useAdminNoticeListQuery` 가 visibility 파라미터 미지원 시 보강) |

---

## 12. 검증 / 회귀 항목

### 12.1 자동화
- 백엔드 Entity 단위: noticeId set/clear, create 시 폴백 없음(기본 null)
- 백엔드 Service 통합: PUBLIC 공지 연결 OK, 비공개 공지 연결 시 422 (`NonPublicNoticeLinkException`), 동시 두 링크 시 422 (`MultipleLinkTargetsException`), 모드 토글 데이터 보존
- 백엔드 Validator 단위 (`PromotionRequestValidationTest`): `@AssertTrue isSingleLinkTarget` 의 PASS/FAIL 케이스 6건 (각 0/1/2/3 set)
- 프론트 RTL:
  - 라디오 NONE → 어떤 입력란도 노출 안 됨
  - 라디오 EXTERNAL_URL → URL 입력란만 노출, NoticeSelector 미노출
  - 라디오 NOTICE → NoticeSelector 만 노출
  - 라디오 CLUB → ClubSelector 만 노출
  - 라디오 변경 시 다른 type 의 입력값 자동 클리어
  - edit 모드 + notice.isAccessible=false → 경고 표시

### 12.2 브라우저 sanity
- 어드민이 PUBLIC 공지 연결한 배너를 만든 후, 메인 페이지에서 클릭 시 `/notices/{id}` 로 이동
- 어드민이 그 공지를 비공개로 전환한 후, 메인 페이지 새로고침 시 해당 배너가 클릭 불가 상태 (Spec #7 비인터랙티브)
- 어드민 edit 폼 진입 시 경고 메시지 노출, 다른 연결로 변경 후 저장 가능

---

## 13. PR 분할 / 머지 전략

본 사양은 단일 PR. 백엔드(스키마 + 검증 + 응답) + 프론트(폼 + Selector + mapper) 가 한 묶음으로 의미. 분리 시 \"공지 연결한 배너의 응답 형태\" 가 백엔드/프론트 비일관 머지 윈도우가 생김.

브랜치명: `feat/promotion-notice-link`

커밋 단위는 plan 에서 task 별로 분할 (마이그레이션 → entity → Request/Command/Service → 응답 DTO → 프론트 types → NoticeSelector → 폼 통합 → mapper → 테스트).

---

## 14. 마이그레이션 전략

1. **Pre-flight 검증 SQL 실행** — §3.2 의 \"동시 link 2개+\" 쿼리. 0 row 확인.
2. 0 row 가 아니면 운영자가 한쪽 null 처리 후 재실행. 완료 후 ALTER 실행.
3. V42 적용 후 기존 행은 모두 `notice_id IS NULL` 자동 → `linkType` derive 시 기존 URL/CLUB/NONE 그대로.
4. 운영자 어드민이 새로 \"공지 연결\" 옵션을 사용하면 그 시점부터 noticeId 가 채워짐. 기존 데이터 변환 zero.

---

## 15. Out of Scope (재확인)

- 공지 자동 비활성화 트리거/이벤트
- PromotionCardResponse 의 `linkType` 노출 (priority chain 충분)
- Notice 검색 API 신규
- `CURATION_LABEL` 변경
- `isCuration` state 의 다른 도메인(다른 컴포넌트) 영향 — 확인 결과 AdminPromotionForm 전용이라 안전 제거
- Spec #6 (어드민 목록 필터 / 권장 사이즈 자동 리사이즈) 등 다른 후속 사양

---

## 16. Open Questions

1. **`useAdminNoticeListQuery` 의 `visibility` 파라미터 지원 여부** — plan 작성 직전에 확인 필요. 미지원 시 본 PR 에서 hook + 백엔드 검색 API 에 `visibility` 필터 파라미터 추가까지 포함되므로 plan 의 task 수가 +1~+2 늘어남.

(그 외 — 데이터 모델 / 검증 / 응답 / UX / 마이그레이션 모두 확정.)

---

## 17. 참고

- 선행 사양: PR1~3 / refinements / Spec #7 (clickability)
- 선행 PR: #278 / #279 / #280 / #281 / #285 / #286
- Notice 도메인: `backend/src/main/java/com/duing/domain/notice/**`
- 메모리 가이드 준수: Conventional Commits, `[#이슈번호]` 형식 금지, Co-Authored-By 라인 금지, `gh pr checks --watch` 금지.
