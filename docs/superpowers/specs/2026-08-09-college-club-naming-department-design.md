# 단과대 동아리 명칭 통일 + 학과(department) 소속 정보

**날짜:** 2026-08-09
**범위:** backend + frontend

---

## 1. 배경 / 문제

- 사용자 노출 명칭이 "학과동아리"·"과동아리"로 혼재. 공식 명칭은 **"단과대 동아리"**.
- 단과대 동아리의 소속 학과를 담을 필드가 없다. 탐색 카드는 중앙동아리만 보조 표기(분과)를 그리고,
  단과대 동아리는 카테고리만 보여 정보 밀도가 비대칭이다.

## 2. 현행 구조 (조사 결과)

- `DEPARTMENT` enum은 **코드베이스에 존재하지 않는다.** 동아리 유형은 `club.central_club` (boolean) 하나로
  모델링되고, 비중앙 동아리의 단과대는 `club.college` (`user.College` enum, nullable)에 담긴다.
  → **내부 enum·필드명 변경 불필요. 표시 문자열만 교체한다.**
- `club.division`(분과)은 **중앙동아리 전용**으로 표시·필터된다. 비중앙 행의 division 값은
  화면에 나오지 않는 잔여 데이터다.
- 사용자 노출 "학과동아리/과동아리" 실제 히트는 `ClubExplorePage.tsx` 3곳뿐. 나머지는 Swagger 설명,
  마이그레이션 SQL 주석, 과거 `docs/` 문서, 테스트 `@DisplayName`.
- 배지 `[학과]`는 `ScopeChip`이 scope 코드(`'학과'`)를 그대로 렌더한 결과.
- 단과대 목록이 3중 정의: `backend/.../College.java`, `packages/types/src/user.ts`,
  `apps/web/app/_lib/college.ts`.

### 개발 DB 실측 (비중앙 18건)

| 항목 | 건수 |
|---|---|
| `college IS NULL` | 13 |
| `division` 잔여값 보유 | 3 (`"공과대학"`, `"전시창작"`, `"사회"`) |

`division` 잔여값은 전부 단과대명 또는 분과명이고 **학과명이 아니다.** 자동 매핑 불가.

## 3. 결정 사항

| # | 결정 |
|---|---|
| 1 | `college`는 **DB NOT NULL로 강제하지 않는다.** 기존 NULL 행은 보정하지 않고 리포트만. 생성/수정 API + FE에서 `centralClub=false`면 필수 검증 |
| 2 | 신규 컬럼명 **`department`** (nullable, 자유입력, trim, 최대 50자) |
| 3 | URL `?scope=학과` 코드는 **유지**(공유·북마크 호환). 표시 라벨만 `단과대` / `단과대 동아리` |
| 4 | 기존 `division` 잔여값은 **자동 마이그레이션하지 않는다.** `department`는 NULL로 시작 |
| 5 | 중앙 ↔ 단과대 전환 시 `college`/`department` **보존**. 표시 여부만 `centralClub`이 결정 |
| 6 | **`department`는 운영진이 수정 가능.** `college`는 총동연 전용 잠금 유지 (권한 분리) |
| 7 | 단과대 목록 SoT = `packages/types/src/user.ts`. `app/_lib/college.ts`는 재수출로 축소. 백엔드 enum은 별도 유지 |

## 4. 데이터 / 마이그레이션

`V108__alter_club_add_department.sql`

```sql
ALTER TABLE club ADD COLUMN department varchar(50);
COMMENT ON COLUMN club.department IS '단과대 동아리의 소속 학과(자유입력). 중앙동아리·미지정은 null.';
COMMENT ON COLUMN club.college IS '단과대 동아리의 소속 단과대학 (user.College enum 코드). 중앙동아리는 null.';
```

- 데이터 백필 없음. 기존 행 `department = NULL`.
- `college` 컬럼 코멘트는 V33의 "학과동아리" 문구를 대체한다. **V33 파일 자체는 수정하지 않는다**
  (Flyway 체크섬 불일치 → prod `validate` 실패).
- 롤백 안전: 컬럼 추가만이라 이전 이미지 부팅 가능(앱이 모르는 컬럼은 무시).

### 4.1 배포 순서 — **백엔드 먼저**

FE(Vercel)와 BE(Lightsail)가 독립 배포라 순서가 결과를 바꾼다.

FE 를 먼저 배포하면, 운영진이 학과를 입력해 저장할 때 `PATCH /clubs/{id}` 에 실린 `department`
를 구 백엔드가 알지 못해 조용히 버린다. Jackson 의 unknown-properties 무시가 기본이라 **200 이
돌아오고 폼은 "저장" 을 표시하지만 값은 남지 않는다.** 에러가 없어 사용자도 운영자도 눈치채기
어렵다. 백엔드를 먼저 올리면 반대 방향(구 FE × 신 BE)은 `department` 를 안 보낼 뿐이라 무해하다.

## 5. 백엔드 설계

### 5.1 불변식 위치

`college` 필수 검증은 **두 지점**에 둔다.

- **생성**: `CreateClubRequest.@AssertTrue` — `centralClub || college != null`.
  기존 `isFeePairConsistent` 와 같은 패턴.
- **수정**: `Club.update()` 안 — `clearCollege=true` 인데 `!centralClub` 이면
  `CollegeRequiredException`. 엔티티에 두면 리더·총동연 어느 경로로 들어와도 뚫리지 않는다.

기존 `college IS NULL` 행은 college를 건드리지 않는 수정 요청에서는 그대로 통과한다
(NULL을 새로 만드는 경로만 막는 설계).

### 5.2 권한 분리

- `UpdateClubRequest`(리더/운영진): `department` **포함**. `college`/`division`/`name`/`category`는
  필드 자체가 없어 API로도 못 바꾼다 (기존 구조 그대로).
- `AdminUpdateClubRequest`(총동연): `department` + 기존 잠금 필드 전부.

### 5.3 변경 파일

`Club`(엔티티) · `ClubException` · `CreateClubRequest` · `CreateClubCommand` · `GeneralClubService` ·
`UpdateClubRequest` · `AdminUpdateClubRequest` · `UpdateClubCommand` · `ClubSummaryQuery` ·
`ClubDetailQuery` · `ClubSummaryResponse` · `ClubDetailResponse` · `ClubApi`(Swagger 문구)

## 6. 프론트 설계

### 6.1 라벨 SoT

`app/clubs/_lib/clubs.ts` 에 scope 표시 라벨을 모은다. 컴포넌트에서 문자열을 직접 쓰지 않는다.

```ts
export const SCOPE_LABEL = { 중앙: '중앙', 학과: '단과대' };            // 배지
export const SCOPE_CLUB_LABEL = { 중앙: '중앙동아리', 학과: '단과대 동아리' }; // 필터·칩
```

### 6.2 카드 보조 표기

중앙=분과, 단과대=학과로 갈리는 규칙을 헬퍼(`clubAffiliationLabel`) 하나로 모아
`ClubCard`·`ClubListItem`이 공유한다. 값이 없으면 `null`을 반환해 **영역 자체를 렌더하지 않는다**
(placeholder 금지).

**학과가 비어 있으면 단과대학명으로 물러선다.** 특정 학과가 아니라 단과대 산하로 활동하는
동아리가 있어서다. 배지의 "단과대"는 유형만 말하고 어느 단과대인지는 알려주지 않으므로
중복 표기가 아니다. 학과가 있으면 학과명이 우선이고, 둘 다 없을 때만 영역을 비운다.

```
[ 중앙 ]  다이노    운동  스포츠레저분과
[ 단과대 ] RGB      예술  회계학과          ← 학과 있음
[ 단과대 ] RGB      예술  글로벌경영대학     ← 학과 없음 → 단과대학으로 폴백
[ 단과대 ] RGB      예술                    ← 둘 다 없음 → 영역 미렌더
```

카드 뷰모델(`Club`)에 `college`를 함께 싣는다.

### 6.3 상세 페이지

- **데스크탑 히어로 pill**: `카테고리 · 분과`(중앙) / `카테고리 · 학과`(단과대).
  비중앙에서도 `division` 잔여값이 새어나오던 것을 `centralClub` 게이트로 함께 막는다.
- **모바일 히어로**: 모바일에는 소속을 보여줄 자리가 없어 데스크탑에 있던 정보가 통째로
  빠져 있었다. 이름 아래 메타 행에 소속을 싣는다 — 중앙은 `분과명`, 단과대는
  `단과대학 · 학과`(학과 없으면 단과대학만). 값이 전부 없으면 줄 자체를 그리지 않는다.
  좁은 화면에서 접힐 때를 대비해 행 정렬은 `items-start`.
  창설년도·기수는 이 줄에서 뺐다 — 창설년도는 바로 아래 통계에, 기수는 상세정보 탭에 이미 있다.
  데스크탑 히어로는 배치가 달라 창설년도·기수를 그대로 둔다.
- `ClubDetailInfoList`: 단과대 동아리에 한해 `단과대` / `학과` 행 추가. 값 없으면 행 생략.

### 6.4 폼

- **운영진(`ClubInfoForm`)**: `학과` 자유입력 추가(편집 가능). `단과대학`은 잠금 표시 유지.
  비우기는 clear-intent 규약대로 `''` 전송 → BE `blankToNull`.
- **총동연(`AdminClubCreateForm`)**: 중앙동아리 체크 해제 시 `단과대학 *`(필수) + `학과`(선택) 노출.
  단과대 미선택이면 제출 차단.

### 6.5 변경 파일

`packages/types/src/club.ts` · `packages/schemas/src/index.ts` · `app/_lib/college.ts` ·
`clubs/_lib/clubs.ts` · `clubs/_lib/clubAdapter.ts` · `ScopeChip` · `ClubCard` · `ClubListItem` ·
`ClubExplorePage` · `ClubDetailHero` · `ClubDetailInfoList` · `ClubInfoForm` · `AdminClubCreateForm`

### 6.6 키워드 검색

`/clubs` 키워드 검색 대상에 학과를 더한다. 기존 대상은 동아리명·소개·태그였고, 여기에 학과를
넣으면 "회계학과" 로 단과대 동아리를 바로 찾을 수 있다. 분과·단과대학은 이미 전용 필터가 있어
키워드까지 태우지 않는다. 검색창 안내 문구도 실제 대상과 맞춘다.

## 7. 테스트

- **BE**: 단과대 동아리 생성 시 college 누락 → 400 / college 포함 → 성공 / 학과 없이 생성 성공 /
  리더 수정으로 department 변경 성공 / 리더 요청에 college가 실려도 무시됨 /
  비중앙 동아리 `clearCollege=true` → 거부 / 중앙↔단과대 전환 후 college·department 보존
- **FE**: 카드가 단과대 동아리에 `[단과대]` + 학과를 그린다 / 학과 없으면 단과대학으로 폴백 /
  둘 다 없으면 영역 미렌더 / 중앙동아리는 학과 값이 남아 있어도 분과만 /
  운영진 폼에서 학과 편집 가능·단과대는 잠금 / 관리자 생성 폼 단과대 필수 /
  모바일 히어로 소속 줄(중앙=분과명, 단과대=단과대학·학과, 창설년도·기수 미포함)

### 7.1 로컬 QA 실측 (2026-08-09)

백엔드는 실제 HTTP 요청으로 9개 시나리오를 확인했다 — 단과대학 없이 생성 400, 학과 없이 생성 201,
중앙동아리 단과대학 없이 생성 201, 운영진 학과 수정 200, **운영진 요청에 `college`/`clearCollege`/
`name`/`division` 을 끼워 넣어도 전부 무시**, 학과 비우기 `""` → null, 총동연 `clearCollege` 400,
학과 앞뒤 공백 trim, 중앙↔단과대 전환 후 단과대학·학과 보존.

프론트는 실제 브라우저로 확인했다 — PC(1440)·모바일(390/320) 카드 표기와 오버플로,
상세 정보 탭 소속 행, 모바일 히어로 소속 줄, 총동연 생성 폼의 단과대학 필수 차단과 조건부 렌더링,
운영진 폼의 학과 편집·단과대학 잠금(저장 후 DB 반영까지 확인).

## 8. Out of Scope

- 학과명 표준화·자동 정규화·학과 마스터 데이터 (자유입력 + trim 만)
- 카드에 단과대학과 학과를 **동시에** 표기 (학과가 있으면 학과만 — 폭이 좁다)
- 데스크탑 히어로 pill 에 단과대학 추가 (카테고리 옆이라 짧게 유지)
- 학과 **전용 필터** 신규 추가 (칩·드롭다운 — 키워드 검색으로만 닿는다)
- 기존 `division` 잔여 데이터 정리·삭제
- 총동연 목록/상세 테이블에 학과 컬럼 추가
- **`centralClub` 토글 API의 college 필수 검증** — 토글은 `Club.update()` 를 거치지 않아
  가드가 걸리지 않는다. `AdminClubCreateForm` 은 중앙동아리를 항상 `college=null` 로 만들므로,
  총동연이 그런 동아리를 "중앙 해제" 하면 곧바로 `centralClub=false && college IS NULL` 이 된다.
  그 상태의 카드는 `[단과대]` 배지만 뜨고 소속 텍스트가 비며 `?college=` 필터에서 빠진다.

  **그럼에도 막지 않는 이유**: 토글을 차단하면 `college` 를 가진 적 없는 중앙동아리는 영영
  단과대 동아리로 전환할 수 없다 — 총동연 수정 폼이 단과대학 select 를 `centralClub=false`
  일 때만 그리기 때문이다(교착). 반면 전환 **후** 에는 같은 폼에 단과대학 select 가 나타나므로
  총동연이 UI 로 바로 채울 수 있다. 즉 되돌릴 수 없는 상태가 아니라 채우면 되는 공백이고,
  결과 상태도 기존 NULL 행(개발 DB 13건)과 동일하다.

  제대로 닫으려면 토글 다이얼로그가 전환 시 단과대학을 함께 받아야 하며, 이는 별도 작업이다.
- 기존 `college IS NULL` 행 **리포트 화면·배치** (결정 1) — 이번 스펙 §2 조사 표로 대신하고,
  운영 도구화는 후속으로 남긴다
- `docs/superpowers/` 과거 스펙·플랜 문서의 "학과동아리" 표기 (당시 기록물)
- V33 마이그레이션 파일 내 주석 (Flyway 체크섬 고정)
