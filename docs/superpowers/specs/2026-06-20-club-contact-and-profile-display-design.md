# 동아리 연락처 정책 변경 및 프로필 정보 표시 보강 설계

- 날짜: 2026-06-20
- 범위: 2개 PR로 분할.
  - **PR1** — 동아리 연락처(`contactEmail`)를 이메일 전용에서 **자유 입력**으로 전환 (FE + BE)
  - **PR2** — 동아리 상세 **회장 정보**, 지원자 상세 **단과대·학과·학년**, 멤버 목록 **학과·학년·마스킹 전화** 표시 보강 (FE + BE)

## 목표

- 동아리 연락 수단을 이메일에 한정하지 않고 전화번호·카카오톡 오픈채팅·인스타그램 DM 등 자유롭게 받을 수 있게 한다.
- 동아리 상세/지원자 관리/멤버 관리 화면에서 이미 보유 중이거나 살짝 빠져 있던 프로필 정보를 노출해 운영 편의를 높인다.
- 개인정보는 최소 노출 원칙을 지키되(멤버 전화 마스킹), 지원자 관리처럼 실제 연락이 필요한 영역은 정책 검토 전까지 범위를 넓히지 않는다.

---

## PR1 — 연락처 정책 변경

### 결정 사항

- **DB 컬럼(`contact_email`)·엔티티 필드(`contactEmail`)는 유지.** 마이그레이션·API 스펙 변경 없음. 의미상 약간 아쉬우나 운영 비용 대비 효과가 낮아 추후 스키마 정리 시 일괄 리네임 검토.
- **검증:** `@Email` / zod `.email()` 만 제거. 기존 **길이 제한(`@Size(max=200)` / zod `.max(200)`)은 유지** — 무제한 자유입력 방지.
- **입력 UI:** `type="email"` → `type="text"`. 라벨 `컨택 이메일` → `연락처`. placeholder 는 전화번호 권장 톤으로 `예: 010-0000-0000`.
- **상세 표시:** `mailto:` 링크 제거. 값이 `http://` 또는 `https://` 로 시작할 때만 외부 링크(`target="_blank" rel="noopener noreferrer"`), 그 외는 일반 텍스트. 라벨도 `컨택` → `연락처` 로 통일.

### 변경 지점

- BE: `UpdateClubRequest.contactEmail` 의 `@Email` 제거(`@Size(max=200)` 유지). 그 외 BE(Command/Entity/Response/Service)는 무변경.
- FE 스키마: `packages/schemas` 의 `contactEmail` 에서 `.email()` 제거(`.max(200)` 유지).
- FE 폼: `ClubInfoForm.tsx` — input type·라벨·placeholder 변경.
- FE 표시: `ClubDetailInfoList.tsx`(라벨 `컨택`→`연락처`), `ClubContactCard.tsx`(mailto 제거 + http(s) 한정 링크/텍스트 분기).

### 테스트

- FE: `ClubContactCard` — http(s) 값은 `target=_blank rel=noopener noreferrer` 링크로, 그 외 값(전화·카톡 텍스트)은 링크 없이 텍스트로 렌더. `ClubInfoForm` — 라벨/placeholder/type 확인(가능 범위).
- BE: 이메일 형식이 아닌 연락처(예: `010-0000-0000`)로 동아리 정보 수정이 통과하는지(기존 동아리 수정 테스트에 케이스 보강 또는 신규).

### Out of Scope (PR1)

- `contact_email` → `contact_info` 컬럼명 변경, Flyway 마이그레이션, API 스펙 변경.
- 연락처 자동 링크 생성(전화 `tel:`, 카톡 딥링크 등) — http(s) 외 자동 링크 없음.

---

## PR2 — 정보 표시 보강

### 1. 동아리 상세 — 회장 정보

- BE 응답(`ClubDetailResponse`)에 이미 `leaderName` 존재 → **BE 무변경.**
- FE: `ClubDetailInfoList.tsx` 에 `동아리 회장` 행 추가. `leaderName` 이 있을 때만 표시하고 `null`(공석)이면 행 자체를 생략(기존 행들과 동일 패턴).

### 2. 지원자 상세 — 단과대·학과·학년

- 현재 FE 렌더링 코드(`ApplicantProfilePanel`)·FE 타입은 `college/major/grade` 를 이미 기대하나 **BE 응답 DTO에 누락** 되어 빈 값.
- BE: `ApplicantDetailQuery.ApplicantInfoQuery` 와 `ApplicantDetailResponse.ApplicantInfo` 에 `college`(enum)·`major`(String)·`grade`(enum) 추가 + 매핑 시 `User` 에서 추출.
- 화면 표시: 단과대 / 학과 / 학년. enum 은 기존 화면과 동일한 한글 라벨 매핑 사용, `major` 는 문자열 그대로.
- **전화번호는 추가하지 않음** — 원 요구 범위(학과·학년) 밖이며 개인정보 노출 확대라 별도 정책 검토 대상.

### 3. 멤버 목록 — 학과·학년·마스킹 전화

- BE: `ClubMemberQuery` 와 `ClubMemberResponse` 에 `major`(String)·`grade`(enum)·`phoneMasked`(String) 추가 + 매핑.
- **마스킹은 BE에서 수행.** `phoneMasked` 만 응답에 싣고 **원본 `phone` 은 목록 API에 포함하지 않는다.**
  - 규칙: `phone == null` 이면 `phoneMasked == null`. `010-1234-5678` → `010-****-5678`(가운데 그룹만 마스킹). 예상 형식이 아니면 안전하게 마지막 4자리만 노출.
  - 재사용 가능한 마스킹 유틸을 두어 향후 다른 화면에서도 동일 정책 적용.
- FE: `ClubMember` 타입에 `major/grade/phoneMasked` 추가, `MemberRow.tsx` 에 학과/학년/전화(마스킹값) 표시. FE는 마스킹된 값만 표시(자체 마스킹 없음).

### 리뷰 강도

PR2는 지원자/멤버 **응답 필드 추가(additive, 하위호환)** 로 API contract 변경에 해당 → 기본 리뷰(duing-code-reviewer + codex)에 **codex adversarial-review** 추가. FE 응답 스키마(zod)가 있으면 함께 갱신해 파싱 깨짐 방지.

### 테스트

- BE: 지원자 상세 응답에 `college/major/grade` 포함 / 멤버 목록 응답에 `major/grade/phoneMasked` 포함 + 마스킹 결과(`010-****-5678`, null, 비정형 형식) 검증. 마스킹 유틸 단위 테스트.
- FE: `ClubDetailInfoList` 회장 행 표시/공석 시 생략. `MemberRow` 학과·학년·마스킹 전화 표시. (필요 시 지원자 패널 표시 확인.)

### Out of Scope (PR2)

- 지원자 상세 전화번호 노출, 회원 전화번호 원본 노출.
- 개인정보 공개 정책 변경, 회원 연락처 공개 범위 확대.
- 엑셀(CSV) 다운로드 수정, 관리자 기능 추가, 전화번호 검색 기능, 추가 API 엔드포인트 생성.
