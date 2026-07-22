# 동아리 정보 편집 페이지 리디자인 — 설계 스펙

- 날짜: 2026-07-22
- 상태: 사용자 승인 대기
- 범위: BE(Club 도메인·API) + FE(운영진 콘솔 편집 폼·Sticky Preview·총동연 콘솔·학생 상세 페이지 데이터 반영)

## 1. 배경과 목표

운영진 콘솔의 동아리 정보 편집 페이지(`/manage/clubs/[clubId]/info`)를 제공된 목업의
정보 구조(IA)·UI·UX 기준으로 전면 리디자인한다. 현재 구현과 목업이 다르면 **목업을 우선**한다.

핵심 변경:

1. 동아리명·카테고리·분과·단과대학은 총동연 전용 관리 항목으로 전환 (운영진에겐 Locked Input)
2. 대표 연락처를 회장 전화 자동 연동 + 공개 범위(`ContactVisibility`) 설정으로 전환
3. 회비를 `membershipFeeAmount` + `FeeCycle`로 구조화
4. 주요 프로젝트를 아이콘 ID 기반 카드 리스트(`projects[]`)로 구조화
5. SNS 플랫폼을 4종(Instagram·카카오톡·Facebook·기타)으로 정리, 기타는 label 직접 입력
6. 우측 Sticky Preview(학생에게 보이는 프로필) 실시간 반영
7. `contactEmail`·`majorProjects`·`membershipFee`(문자열) 논리 제거

## 2. 권한 정책

동아리 정보는 동아리의 공식 정보이므로 수정 권한은 회장(LEADER)에게만 부여한다.
(현행 `requireEditableClubLeader` + FE `readOnly` 동작과 동일 — 유지·명문화)

| 역할 | 조회 | 수정 |
|---|---|---|
| LEADER | ✅ | ✅ |
| OFFICER | ✅ | ❌ (BE 403) |
| ADMIN (총동연) | ✅ | ✅ (전용 API) |

- FE: OFFICER에게는 모든 입력 필드를 읽기 전용으로 표시하고 저장 버튼을 노출하지 않는다.
- BE: `PATCH /clubs/{clubId}`는 LEADER만 호출 가능(현행 유지). ADMIN은 `PATCH /admin/clubs/{clubId}` 사용.

## 3. BE — 데이터 모델 (V91 마이그레이션)

### 3.1 신설 컬럼 (club)

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `contact_visibility` | VARCHAR(20) | NOT NULL DEFAULT 'PUBLIC' | enum `ContactVisibility`: `PUBLIC` / `LOGGED_IN_ONLY` / `PRIVATE` |
| `membership_fee_amount` | INTEGER | nullable | 원 단위 |
| `fee_cycle` | VARCHAR(20) | NOT NULL DEFAULT 'NONE' | enum `FeeCycle`: `NONE` / `ONE_TIME` / `SEMESTER` / `YEARLY` / `MONTHLY` |
| `projects` | JSONB | NOT NULL DEFAULT '[]' | `[{icon, title, subtitle}]`, 순서 = 배열 순서. `icon`은 `ProjectIcon` enum 이름(대문자, 예: `"CODE"`) |

`fee_cycle`은 NOT NULL을 유지한다. `NONE`은 "미입력"과 "명시적 회비 없음"을 구분하지
않으며, 표시 규칙(§8)에서 항목 숨김으로 처리한다.

### 3.2 DB CHECK 제약

```sql
-- NONE ⇔ 금액 없음 (양방향 일치)
ALTER TABLE club ADD CONSTRAINT chk_club_fee_cycle_amount
  CHECK ((fee_cycle = 'NONE') = (membership_fee_amount IS NULL));
-- 금액이 있으면 양수
ALTER TABLE club ADD CONSTRAINT chk_club_fee_amount_positive
  CHECK (membership_fee_amount IS NULL OR membership_fee_amount > 0);
```

기존 행은 `fee_cycle='NONE'`, `membership_fee_amount=NULL`이므로 제약을 즉시 만족한다.

### 3.3 sns_links 구조 변경 + 데이터 보존 변환

새 구조: `{platform: INSTAGRAM | KAKAO | FACEBOOK | OTHER, label?, url}`

- 기존 enum `X` / `YOUTUBE` / `WEB` 값은 V91에서 JSONB 데이터 변환으로 보존:
  - `X` → `{platform: OTHER, label: "X"}` / `YOUTUBE` → `{platform: OTHER, label: "YouTube"}` / `WEB` → `{platform: OTHER, label: "Website"}`
- 기존 `KAKAO`·`INSTAGRAM`·`FACEBOOK`은 그대로 유지.

### 3.4 논리 제거 (컬럼 유지, API 제외)

`contact_email` · `major_projects` · `membership_fee`(문자열) — 엔티티 필드·컬럼은 유지하되
Request/Response에서 제외한다. 물리 drop은 릴리스 안정화 후 **후속 마이그레이션**(Out of Scope).
향후 대표 이메일이 필요하면 `contact_email`을 재활용하지 않고 `representativeEmail`로 신설한다.

### 3.5 대표 연락처 (저장하지 않음)

- 대표 연락처는 Club에 저장하지 않고, 조회 시 회장(`ClubMember role=LEADER`)의
  `User.phone`을 실시간 조회한다(기존 `findFirstByClubIdAndRole` JOIN FETCH 재사용).
- 회장이 변경되면 자동으로 새 회장의 번호가 사용된다.
- **회장 미등록** 동아리: `contactPhone = null`. §5.3 / §6.4 참조.

## 4. BE — 검증 정책

### 4.1 projects

- 최대 **6개**.
- `icon`: BE에 **`ProjectIcon` enum**을 정의하고 enum 바인딩으로 검증한다(허용 외 값 400,
  Swagger 문서화 자동). JSONB·API에는 enum 이름(대문자)을 저장·직렬화한다.

  ```java
  public enum ProjectIcon {
      CODE, TROPHY, USERS, ROCKET, BOOK, CAMERA, PALETTE, MUSIC, MIC, GLOBE,
      HEART, LEAF, BRIEFCASE, LIGHTBULB, FLASK, GAMEPAD, DUMBBELL, GRADUATION,
      MONITOR, SPARKLES
  }
  ```

  FE는 enum 이름 ↔ lucide 컴포넌트 매핑 테이블(`CODE → Code` 등)로 렌더링한다.
  목록 변경 시 BE enum / FE 매핑 동시 수정(userNameSchema 이중 목록 전례).
- `title`: 필수, 1~30자 (trim 후 공백만이면 400)
- `subtitle`: 선택, 최대 40자 (빈 문자열 → null 정규화)

### 4.2 snsLinks

- `platform ≠ OTHER`이면 **label은 저장하지 않는다** — 요청에 label이 와도 무시하고 null로 정규화.
- `platform = OTHER`이면 label 필수, 1~20자.
- `url`: 기존 검증 유지. 최대 10개(현행 유지).

### 4.3 회비

- `feeCycle = NONE`이면 `membershipFeeAmount`는 null이어야 함 (불일치 400, DB CHECK가 백스톱).
- `feeCycle ≠ NONE`이면 amount 필수, `1 ~ 10,000,000`.
- 부분 수정 시 두 필드는 **항상 쌍으로** 전송한다(FE 규약) — 한쪽만 변경돼도 둘 다 포함.

### 4.4 highlights / tags (2단 제한 — tagline 20/60 전례)

- highlights: **BE 검증 backstop 10 유지**, FE 추가 제한 7. (BE를 7로 조이면
  기존 8~10개 보유 동아리의 전체 저장이 깨진다 — zod 전체 스냅샷 검증 함정.)
- tags: 개수 5(현행), **개당 5자는 FE 입력 제한만** — zod/BE backstop은 현행 길이 유지.

### 4.5 contactVisibility

- enum 외 값 400. 부분 수정 규약(누락 시 유지) 따름.

## 5. BE — API 변경

### 5.1 리더용 `PATCH /api/v1/clubs/{clubId}` (UpdateClubRequest 재정의)

- **제거**: `name`, `category`, `division`, `college`, `clearCollege`, `contactEmail`,
  `majorProjects`, `membershipFee`
- **추가**: `contactVisibility`, `membershipFeeAmount`, `feeCycle`, `projects`
- 유지: description, logoUrl/coverUrl(+clear flags), tags, snsLinks, faqs, foundedYear,
  cohortNumber, location, activityFrequency, activeDays, tagline, highlights
- 기존 clear-flag / blankToNull 부분 수정 규약 유지.

### 5.2 어드민용 `PATCH /api/v1/admin/clubs/{clubId}` (AdminUpdateClubRequest 분리)

- 리더용 필드 전부 + 잠금 필드(`name`, `category`, `division`, `college`, `clearCollege`) 포함.
- #731에서 리더와 공유하던 요청 DTO를 이 시점에 분리한다.

### 5.3 `GET /api/v1/clubs/{clubId}` 응답 (ClubDetailResponse)

- **추가**: `contactPhone`(nullable), `contactVisibility`(**항상 포함** — phone이 미노출이어도
  정책 상태를 FE가 안내할 수 있도록), `membershipFeeAmount`, `feeCycle`, `projects`
- **제거**: `contactEmail`, `majorProjects`, `membershipFee`
- `contactPhone` 노출 규칙:

  | 정책 | 비로그인 | 로그인(일반) | 해당 동아리 LEADER·OFFICER / ADMIN |
  |---|---|---|---|
  | PUBLIC | ✅ 원본 | ✅ 원본 | ✅ 원본 |
  | LOGGED_IN_ONLY | ❌ null | ✅ 원본 | ✅ 원본 |
  | PRIVATE | ❌ null | ❌ null | ✅ 원본 |

  - 임원·ADMIN 상시 노출은 편집 화면의 읽기 전용 표시용.
  - 회장 미등록이면 정책과 무관하게 `contactPhone = null`.
  - 미노출은 `null` 직렬화(recruitment `showApplicantCount` 전례).
- 어드민 단건 조회(`GET /admin/clubs/{clubId}`)는 동일 Response 재사용 — ADMIN이므로 항상 노출.

## 6. FE — 편집 폼 리디자인

`ClubInfoForm` 전면 재작성. **`mode: 'leader' | 'officer' | 'admin'`** prop 하나가
화면 변형과 편집 권한을 함께 표현한다(추가 role 분기 금지, 무효 조합 원천 차단):

| mode | 잠금 필드(동아리명·카테고리·분과/단과대학) | 나머지 필드 | 저장 버튼 |
|---|---|---|---|
| `leader` | Locked UI (읽기 전용) | 편집 가능 | ✅ |
| `officer` | Locked UI | 전체 읽기 전용 | ❌ 미노출 |
| `admin` | 편집 가능 | 편집 가능 | ✅ |

호출부(운영진 콘솔 페이지)는 `myRole → mode` 1회 매핑, 총동연 콘솔은 `mode='admin'` 고정.
목업의 번호 카드(①~⑧) 구조·간격·계층을 그대로 따른다. 반복 데이터는 배열 기반.

### 6.1 카드 구성 (목업 순서)

1. **로고·커버 이미지** — 큰 커버(16/9) + 좌하단 겹침 로고. 기존 `ImageUploader` 재사용,
   업로드 placeholder 개선.
2. **기본 정보** — Locked 동아리명·카테고리·분과(중앙)/단과대학(과) + 창설년도·현재 기수·
   동아리방 위치 + 대표 연락처(읽기 전용 전화 + 공개 범위 3택).
   - `mode='leader' | 'officer'`: Locked Input(자물쇠 아이콘) + 안내 문구
     "동아리명 · 카테고리 · 분과(또는 단과대학)는 총동연에서 관리하며 운영진은 수정할 수 없습니다."
   - `mode='admin'`: 해당 필드 편집 가능(input/select).
3. **활동 요일·빈도·회비** — 월~일 선택 버튼(주말은 coral 톤), 주 N회, 금액 입력 + 납부 주기
   세그먼트(회비 없음/1회 납부/학기당/연간/월간).
4. **소개** — 한줄 소개(입력 20자 제한 + `n / 20` 카운터), 해시태그 칩(개당 5자·최대 5개,
   기존 `TagsInput` IME 가드 유지), 상세 소개(**textarea 유지** + 목업 카드 스타일,
   마크다운 에디터 도입 안 함).
5. **이런 사람이 좋아할 거예요** — 드래그 핸들 + 체크 아이콘 카드, 추가/삭제/드래그 정렬,
   추가 제한 7 (`n/7` 표시, 기존 8~10개 데이터는 표시·삭제 가능하되 추가 불가).
6. **주요 프로젝트** — 아이콘(팔레트 순환 배경) + 제목 + 부제목 카드, 편집 버튼,
   드래그 정렬, 최대 6. 편집 UI에 **아이콘 선택기**(20종 그리드, 선택 강조).
7. **SNS·외부 링크** — 아이콘 + 플랫폼 선택(Instagram/카카오톡/Facebook/기타) + URL.
   기타 선택 시 플랫폼명(label) 입력 필드 노출. 추가/삭제.
8. **FAQ** — Q&A 카드, 추가/수정/삭제.

### 6.2 드래그 정렬

- highlights·projects만 드래그 정렬(목업 기준). SNS·FAQ는 추가/삭제만.
- **dnd-kit 재사용**(photos 전례). `<img>`·핸들에 `draggable=false` 가드,
  실브라우저 QA 필수(jsdom은 dnd 못 잡음 — 레포 전례).

### 6.3 저장 규약

- 현행 부분 diff(`buildPayload`) 방식 유지. 회비 두 필드는 쌍으로 전송(§4.3).
- leader payload에는 잠금 필드·논리 제거 필드가 아예 없음. admin payload는 잠금 필드 포함.
- `mode='officer'`: 전 필드 읽기 전용 + 저장 버튼 미노출(§6 표).

### 6.4 회장 미등록 UI

- 대표 연락처 자리에 전화번호 대신 안내 표시:
  "회장 미등록 — 회원 명단에서 회장을 지정하면 자동으로 연동됩니다."
- 공개 범위 선택은 그대로 동작(저장 가능) — 회장 지정 시 즉시 적용된다.
- Preview·학생 페이지에서는 연락처 미노출.

### 6.5 안내 문구

- 대표 연락처 하단(상시): "대표 연락처를 공개하면 외부 방문자도 동아리에 직접 연락할 수
  있습니다. 공개 전 회장에게 반드시 안내 및 동의를 받아주세요."
- 공개 범위가 `PUBLIC`일 때 추가 강조(상시): "대표 연락처를 전체 공개하면 로그인하지 않은
  외부 방문자도 전화번호를 확인할 수 있습니다."
- 회비 카드 안내: **`feeCycle === NONE && membershipFeeAmount === null`일 때 노출** —
  "회비 정보가 새 형식으로 개편되었어요. 회비가 있다면 금액과 주기를, 없다면 '회비 없음'을
  선택해 주세요." (legacy 문자열 존재 여부는 응답에 없으므로 조건에 쓰지 않는다.
  트레이드오프: 회비가 진짜 없는 동아리는 NONE 저장 후에도 안내가 계속 보임 — 중립 문구로 무해.)

## 7. FE — Sticky Preview

- 전용 컴팩트 컴포넌트 신설(학생 페이지 컴포넌트 재사용 안 함 — 목업의 카드형 미니 프로필).
- **미리보기 전용** — 저장 버튼은 편집 폼 하단에만 배치하고 Preview에는 두지 않는다.
  역할: 저장 전 모습 확인 + 학생 페이지 렌더링 확인.
- 데이터: `{...detail, ...현재 폼 상태}` 머지 → **저장 전 실시간 반영**.
- 구성(목업): 커버 + 겹침 로고, 동아리명 + 기수 pill, 한줄 소개, 해시태그, 메타 그리드
  (창설/활동 "주 N회 (월·수·금)"/위치/회비 "학기당 3만원"), "이런 사람이 좋아할 거예요"
  상위 3개, 지원하기 버튼(더미). 하단에 "변경 사항은 저장 후 반영" 안내.
- 레이아웃: 데스크톱(xl↑) 우측 sticky(`1fr 380px` 그리드). **모바일에서는 숨김**.
- 대표 연락처는 Preview 메타에 포함하지 않음(목업 기준).
- 회비 `NONE`은 **학생 페이지와 동일하게 항목 숨김**(§8) — Preview는 학생 렌더링과 다르게
  그리지 않는다.

## 8. FE — 학생 상세 페이지 데이터 반영 (`/clubs/[clubId]`)

전면 리디자인이 아닌 새 데이터 구조 반영 수준:

- 주요 프로젝트: 자유 텍스트 → 아이콘 카드 리스트(팔레트 순환: Green→Blue→Orange→Purple 반복).
  `subtitle`이 없으면 빈 공간 없이 한 줄 카드 높이로 렌더링(카드 밀도 유지).
- 회비: `feeCycle` + `membershipFeeAmount` 조합 렌더("학기당 30,000원").
  **`NONE`이면 회비 항목을 항상 숨긴다** — NONE은 "미입력"과 "명시적 없음"을 구분할 수
  없으므로(마이그레이션 기본값) "회비 없음" 라벨을 붙이면 재입력 전 동아리에 오정보가 된다.
  숨김은 정보 손실은 있어도 거짓은 없다.
- 대표 연락처: `contactVisibility`는 항상 응답에 포함되므로 정책 상태를 명시적으로 안내한다 —
  - `PUBLIC` (또는 `contactPhone` 존재): 전화번호 표시
  - `LOGGED_IN_ONLY` + 비로그인: "로그인 후 확인 가능"
  - `PRIVATE`: "대표 연락처 비공개"
  - 회장 미등록(`contactPhone` null인데 정책상 보여야 하는 경우): 항목 미노출(fail-safe)
- SNS: OTHER는 label 렌더, 4종은 고정 아이콘·명칭.
- `contactEmail`·`majorProjects` 렌더 제거.

## 9. PR 분할 & 릴리스 커플링

| PR | 내용 |
|---|---|
| PR-1 (BE) | V91 마이그레이션 + 도메인(enum·검증) + DTO 분리 + 응답 변경 + 테스트 |
| PR-2 (FE) | types/schemas/api 갱신 + 학생 상세 페이지 데이터 반영 |
| PR-3 (FE) | 편집 폼 리디자인 + Sticky Preview + 총동연 콘솔 `mode='admin'` 적용 |

- develop 머지 순서: PR-1 → PR-2 → PR-3.
- ⚠️ **릴리스 커플링**: BE가 응답에서 `contactEmail`·`majorProjects`·`membershipFee`를
  제거하므로 BE·FE는 **같은 릴리스로 prod 동반 배포**(#718+#720 전례).
- ⚠️ **배포 금지 구간**: PR-1 머지 후 PR-2 머지 전까지 develop을 prod에 배포하지 않는다
  (응답 구조 변경으로 구 FE가 깨짐). 최종 배포는 반드시 PR-1→2→3 모두 머지된 상태에서
  동시 릴리스한다.

## 10. 테스트 전략

- BE: visibility 게이트 매트릭스(익명/로그인/임원/ADMIN × 3정책), 회비 쌍 검증(NONE 불일치 400),
  projects 검증(허용 외 icon 400·개수·길이), SNS label 정규화(비OTHER label 무시·OTHER 필수),
  리더 요청에 잠금 필드 부재 확인, 어드민 요청 잠금 필드 수정 성공, V91 sns_links 변환 검증.
- FE: 폼 단위 테스트(Locked 렌더·mode 분기·공개범위 선택·아이콘 선택기·OTHER label 토글·
  회비 세그먼트·highlights 7 제한·카운터), Preview 실시간 반영, 학생 페이지 렌더(null 안전).
- 드래그 정렬·업로드 겹침 레이아웃은 **실브라우저 QA**(:3000, 종료 시 정리).

## 11. Out of Scope

- `contact_email`·`major_projects`·`membership_fee` 컬럼 물리 drop (후속 마이그레이션)
- 대표 이메일(`representativeEmail`) 신설
- 학생 상세 페이지 전면 리디자인 (데이터 반영만)
- 상세 소개 마크다운/리치 에디터 도입
- 프로젝트 썸네일 이미지 업로드
- SNS 플랫폼 enum 추가 확장 (기타로 대응)
- 모바일용 Preview 대안 UI (모바일은 숨김)
- 동아리 사진(photos) 기능 변경
