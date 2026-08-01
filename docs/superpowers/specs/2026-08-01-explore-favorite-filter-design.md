# 탐색 탭 — 찜한 동아리 필터

- 작성일: 2026-08-01
- 범위: `GET /api/v1/clubs` (backend) + `frontend/apps/web/app/clubs` (탐색 탭)
- PR 분리: PR-1 `feat(backend)` → 머지·배포 후 PR-2 `feat(frontend)` (순서 고정, 아래 "릴리스 순서" 참조)

## 배경

탐색 탭은 현재 전체 동아리만 조회할 수 있다. 사용자가 찜(favorite)한 동아리만 모아 볼 수 있는 필터를 추가한다. 찜 도메인(`club_favorite`)과 토글 API 는 이미 존재하므로 새 API 신설 없이 목록 API 에 서버 필터 파라미터 하나를 추가한다.

### 기각한 대안

- **클라이언트 필터링** — 페이지 단위(20건)로 받은 목록을 프론트에서 거르면 페이지당 노출 수와 총 개수가 깨진다.
- **`GET /me/favorites` 재사용** — 응답 DTO(`FavoriteClubResponse`)에 `tags/tagline/activeRecruitment` 가 없어 탐색 카드를 그릴 수 없고, 카테고리·모집상태 등 기존 필터와 조합이 안 된다.

## 파라미터 이름 — `favorite` 로 통일

API 쿼리 파라미터 · 탐색 URL 키 · `ExploreParams` 필드 모두 `favorite` 하나로 쓴다.

- `GET /api/v1/clubs?favorite=true`
- `/clubs?favorite=true`
- `ExploreParams.favorite: boolean`

`favorite=false` 또는 미지정은 **필터 미적용**과 동일하다("찜 안 한 것만"이 아님). FE 는 기본값(false)을 URL 에서 생략하는 기존 직렬화 규칙을 따른다.

## 백엔드 (PR-1)

### 컨트롤러 — `ClubController`

- `@RequestParam(required = false) Boolean favorite` 추가.
- 목록 핸들러에 `@AuthenticationPrincipal UserPrincipal currentUser` 를 추가한다. `/api/v1/clubs` 는 permitAll 이라 **null 일 수 있다** — 상세 조회(`ClubController` 의 `toViewer()` 패턴)에 동일 선례가 있다.
- **`favorite=true` + 미인증 → 401 Unauthorized.** 기존 인증 401 예외 컨벤션을 재사용하고 새 에러코드는 만들지 않는다. 빈 목록 반환으로 얼버무리지 않는다 — "찜이 없음(200 + 빈 content)"과 "로그인 안 함(401)"을 응답 레벨에서 구분한다.
- `favorite=true` + 인증 → `ClubSearchCondition` 에 `favoriteUserId = currentUser.id()` 를 담는다. 그 외에는 null.

### 검색 조건 · QueryDSL

- `ClubSearchCondition`(record) 에 `favoriteUserId`(Long, null=미적용) 필드 추가. record 라 기존 생성자 호출부·테스트 전부 수정 필요.
- `ClubRepositoryImpl.findByCondition` 의 null-무시 predicate 배열에 exists 서브쿼리 하나 추가:

```java
private BooleanExpression favoritedBy(Long userId) {
    return userId == null ? null : JPAExpressions.selectOne()
            .from(clubFavorite)
            .where(clubFavorite.club.eq(club), clubFavorite.user.id.eq(userId))
            .exists();
}
```

- content 쿼리와 count 쿼리가 같은 predicate 배열을 공유하므로 총 개수도 자동으로 맞는다. 카테고리·분과·모집상태·정렬·페이지네이션(offset)과의 조합도 기존 구조가 그대로 보장한다.
- `ClubFavorite` 는 `@SQLRestriction("deleted_at IS NULL")` 소프트 삭제라 서브쿼리에서도 해제된 찜이 자동 제외된다 — 별도 `deletedAt` 조건을 중복으로 넣지 않는다.
- 스키마 변경 없음. Flyway 마이그레이션 없음.

### 응답

`ClubSummaryResponse` 는 그대로 둔다. 찜 여부 표시는 FE 가 기존 `GET /me/favorites/ids` 로 계산하는 현행 방식을 유지한다.

### 테스트 (PR-1)

1. 미인증 + `favorite=true` → 401
2. 인증 + 찜 0건 → 200, 빈 content, totalElements 0
3. 찜 필터 단독 — 찜한 동아리만 반환
4. 찜 필터 + 카테고리 조합 — 교집합 반환, totalElements 정확
5. 해제(soft-delete)된 찜 제외
6. `favorite` 미지정/false — 필터 미적용(전체 반환)

## 프론트엔드 (PR-2)

### URL 파라미터

- `ExploreParams.favorite: boolean`(기본 false), URL 키 `favorite`, true 일 때만 직렬화.
- `toApiParams()` 는 true 일 때만 `favorite: true` 를 전달.
- URL 기반이므로 **페이지 이동·뒤로가기 시 필터 유지**는 기존 구조가 그대로 보장한다.
- 칩 토글 시 `page: 1` 로 리셋(기존 필터와 동일 규칙). 해제하면 파라미터가 URL 에서 빠지며 즉시 전체 목록으로 복귀.

### 칩 UI

- 하트 아이콘 + "찜한 동아리" 토글 칩. 바텀시트 안이 아니라 **상시 노출** 위치에 둔다 — 데스크탑은 정렬 select 가 있는 목록 상단 행, 모바일은 카테고리 레일 아래 필터 행(필터 버튼 옆). 정확한 배치는 구현 시 실브라우저로 확인.
- 자체 칩이 활성 상태를 표시하므로 데스크탑 활성 필터 칩 행(`ActiveFilterChip`)과 모바일 필터 개수 배지에는 **포함하지 않는다**(배지는 바텀시트 내부 필터 개수라는 현행 의미 유지).

### 비로그인 처리

두 겹으로 막는다. 1차 방어가 요청 차단, 401 은 안전망이다.

1. **칩 클릭(비로그인)** — 요청 없이 `/login?next=<현재 URL 에 favorite=true 를 얹은 경로>` 로 이동. 기존 하트 버튼(`handleToggleLike`)과 동일 패턴. 로그인 복귀 시 필터가 켜진 채 돌아온다.
2. **딥링크/공유 링크(`/clubs?favorite=true` 직접 진입, 비로그인)** — `useAuthStore` 상태가 비인증으로 확정되면 목록 쿼리를 보내지 않고(`favorite` 파라미터 제외가 아니라 쿼리 자체 미발행) 목록 영역에 로그인 안내 상태를 렌더한다: **"찜한 동아리를 보려면 로그인해 주세요."** + [로그인하기] 버튼(`/login?next=<현재 URL>`). 인증 상태 하이드레이션 중에는 스켈레톤.
3. **401 수신(Fallback)** — 토큰 만료·인증 상태 불일치 등 예외 상황에서만 도달하는 안전망. 정상 플로우에서는 1·2 에서 FE 가 비로그인 상태를 확인하고 요청 자체를 보내지 않으므로 이 401 은 발생하지 않는다. 수신 시 2 와 동일한 안내 상태로 수렴.

> **자동 리다이렉트를 쓰지 않는 이유** — 요청은 "안내 후 이동"이었으나, 진입 즉시 자동 이동시키면 로그인 페이지에서 뒤로가기 → `/clubs?favorite=true` → 다시 로그인으로 밀리는 루프가 생긴다. 안내 + 버튼이 같은 목적지에 도달하면서 뒤로가기를 살린다. 이 판단이 싫으면 리뷰에서 뒤집을 것.

- 구현 시 ky 클라이언트의 전역 401 처리(토큰 리프레시 플로우)가 이 401 에 불필요하게 개입하지 않는지 확인한다. 토큰이 아예 없으면 리프레시 시도 없이 에러로 떨어지는 것이 기대 동작.

### 찜 해제 즉시 반영

- `favorite` 필터 활성 시 렌더 목록을 `likedIds`(기존 `useFavoriteIdsQuery` 캐시) 와 교차한다. 찜 해제 시 낙관적 캐시 패치로 **카드가 재요청 없이 즉시 사라진다.** 롤백(onError) 시 카드도 되돌아온다.
- 토글 settled 후 `favorite` 필터 활성이면 탐색 목록 쿼리(`clubQueryKeys.list`)를 무효화해 총 개수·페이지 구성을 서버와 동기화한다.
- **페이지 보정** — 마지막 페이지에서 찜 해제로 총 페이지 수가 줄어 현재 페이지가 범위를 벗어나면(재검증 후 `page > totalPages`), 마지막 유효 페이지로 보정해 빈 페이지가 남지 않게 한다. `totalPages === 0` 이면 빈 상태로 수렴.

### 빈 상태 — 두 경우를 구분

- `favorite=true` + **다른 필터 전부 기본값** + 0건 → 전용 빈 상태:
  - "아직 찜한 동아리가 없어요."
  - "관심 있는 동아리를 찜하고 쉽게 다시 찾아보세요."
  - [동아리 둘러보기] = 필터 해제 CTA
- `favorite=true` + **다른 필터 조합** + 0건 → 기존 "조건에 맞는 동아리가 없어요." 유지 — 찜은 있는데 조합 조건이 걸러낸 것을 "찜이 없다"로 오독하게 하지 않는다.

### 테스트 (PR-2)

- `exploreParams` 파싱/직렬화/`toApiParams` — `favorite` 왕복, 기본값 생략
- 빈 상태 분기(전용 vs 기존)
- 비로그인 칩 클릭 → 로그인 리다이렉트 경로
- 찜 해제 시 목록 교차 제거
- 페이지 범위 이탈 시 마지막 유효 페이지로 보정

## 릴리스 순서

**PR-1(BE) 이 먼저 머지·배포되어야 한다.** FE 가 먼저 나가면 기존 BE 가 `favorite=true` 파라미터를 무시해 필터가 적용되지 않은 전체 목록이 그대로 노출된다. 반대로 BE 만 먼저 나가는 것은 무해하다(파라미터를 아무도 안 보냄).

## Out of Scope

- `ClubSummaryResponse` 에 `isFavorited` 필드 추가 — FE 가 `me/favorites/ids` 로 하트를 계산하는 현행 방식으로 충분
- `/me/favorites` 화면 개선(페이지네이션 부재로 21건째부터 안 보임, slate/emerald 토큰 불일치) — 별도 이슈로
- 무한 스크롤 도입 — 탐색은 숫자 페이지네이션 유지
- `POPULAR` 정렬의 FE 노출
- `NavDropdown` 의 "찜한 동아리 8곳" 하드코딩 수정
- `FavoriteToggleButton` 공통화 및 하트 아이콘 중복(3벌) 정리
- `FavoriteClubResponse` DTO 통합

## 검증

1. BE: `./gradlew test` (cwd `backend/`)
2. FE: `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` (cwd `frontend/`)
3. 실브라우저(:3000) QA — 칩 토글·조합 필터·페이지네이션, 찜 해제 즉시 제거, 전용 빈 상태, 비로그인 클릭/딥링크 흐름, 데스크탑·모바일 양 레이아웃
4. 실브라우저 QA — **마지막 페이지에서 찜 해제**로 총 페이지 수가 감소할 때 이전(마지막 유효) 페이지로 보정되고 빈 페이지가 남지 않는지

## 롤백

스키마 변경 없음. BE 는 파라미터 추가만이라 revert 안전, FE 는 UI 변경만이라 revert 안전. 롤백 순서 제약도 없다(FE 를 먼저 되돌리면 아무도 파라미터를 안 보내는 상태로 복귀).
