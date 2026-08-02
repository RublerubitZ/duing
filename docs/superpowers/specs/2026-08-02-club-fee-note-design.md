# 동아리 회비 안내문(feeNote) — 설계

2026-08-02 · 상태: 승인 대기

## 배경

일부 동아리는 모집 분야별(선수/매니저) 또는 신규/기존 회원별로 회비가 다르지만, 현재는
`fee_cycle` + `membership_fee_amount`에서 파생된 대표 금액 한 줄("학기당 30,000원")만
노출된다. 구조화된 요금제 관리 기능 없이, **자유 텍스트 안내문 한 칸**을 추가해 이런
케이스를 커버한다.

## 결정 사항 (사용자 확정)

- `feeNote`는 기존 회비 pair(`feeCycle`/`membershipFeeAmount`)와 **독립적인** 선택 텍스트 필드
- 회비가 NONE이어도 안내문 입력 가능
- 상세 페이지 회비 노출 조건: **대표 회비가 있거나 feeNote가 존재하면** 회비 항목 노출
  (둘 다 없으면 현재와 동일하게 숨김)

## 백엔드

- **마이그레이션 V96**: `ALTER TABLE club ADD COLUMN fee_note VARCHAR(150);` (nullable, 기본 NULL)
  + `COMMENT ON COLUMN club.fee_note IS '회비 안내문';`
- **Club 엔티티**: `@Column(name = "fee_note", length = 150) private String feeNote;`
  - `UpdatePayload`(positional record)에 필드 추가 — 요청→커맨드→페이로드→엔티티 4계층 순서 동기화 주의
  - `update()`: `if (payload.feeNote() != null) this.feeNote = blankToNull(payload.feeNote());`
    — 기존 텍스트 필드(clear-intent 규약: `""` 전송 = 비우기)와 동일 패턴. pair-atomic 블록에 넣지 않는다.
- **요청 DTO**: `UpdateClubRequest` + `AdminUpdateClubRequest` 양쪽에
  `@Size(max = 150, message = "회비 안내는 150자 이하여야 합니다.") String feeNote` + `toCommand()` 스레딩.
  기존 `@AssertTrue isFeePairConsistent()`는 건드리지 않는다.
- **응답**: `ClubDetailQuery` → `ClubDetailResponse`에 `feeNote` 추가 (admin 상세는 동일 DTO 재사용이라 자동 커버)
- **테스트**: 경계값 150자 성공·151자 검증 실패 / feeNote 갱신 반영 / `""` 전송 시 null 클리어 / 상세 응답 포함

## 프론트엔드

- **타입** (`packages/types/src/club.ts`): `ClubDetail.feeNote: string | null`, `UpdateClubPayload.feeNote?: string`
- **스키마** (`packages/schemas`): `clubProfileBaseSchema`에 `feeNote: 150자 max` 추가
  (updateClubSchema/adminUpdateClubSchema 자동 상속, `feePairRule` 무관)
- **관리 폼** (`ClubInfoForm.tsx` 섹션 3 "활동 요일 · 빈도 · 회비"):
  - 기존 회비 입력 아래에 라벨 **"회비 안내 (선택)"** + 글자수 카운터 `{n}/150`
    (HeroActivityEditor의 라벨+카운터 한 줄 idiom 재사용)
  - `<textarea rows={4} maxLength={150}>`, placeholder:
    ```
    선수 : 학기당 30,000원
    매니저 : 학기당 15,000원

    신규 회원은 첫 학기만 5,000원이 추가됩니다.
    ```
  - 하단 설명 문구: "모집 분야별 또는 신규/기존 회원 등 회비가 다른 경우 자유롭게 안내해 주세요."
  - dirty-diff payload: `feeNote !== (detail.feeNote ?? '')`일 때만 전송, 비우기는 `""` 전송(BE blankToNull)
  - feeCycle과 무관하게 항상 활성 (NONE이어도 입력 가능)
- **상세 페이지** (`/clubs/[id]`):
  - `ClubDetailInfoList`: 회비 행 노출 조건을 `formatClubFee(...) != null || feeNote 존재`로 확장.
    대표 금액(있으면) 아래에 feeNote를 **보조 텍스트 크기 + `whitespace-pre-wrap` + `break-words`** 로 표시
    (줄바꿈 유지, 공백 없는 긴 문자열도 행 안에서 줄바꿈, 파싱/마크다운 없음).
    대표 금액이 없으면 **빈 공간(placeholder 줄) 없이 안내문만** 표시.
  - `ClubProfilePreview`(관리 미리보기): 동일 규칙 반영
  - `ClubDetailStats`(통계 카드): 변경 없음 — 대표 금액만 유지
  - `ClubDetailTabs`의 회비 관련 노출 게이트가 있으면 동일 조건으로 확장
- **테스트**: 폼 payload 구성(입력/비우기/미변경) + 상세 노출 분기(없음/대표만/안내만/둘 다)

## 배포 호환성

- 새 컬럼은 nullable — 기존 데이터·구버전 이미지와 완전 호환, 롤백 안전
- FE가 먼저 배포되어도 `feeNote` undefined → 미노출(현재와 동일). BE 먼저 배포 시 FE는 필드 무시
- BE+FE 단일 PR로 진행 (scope 생략: `feat: …`), develop squash 머지

## Out of Scope

- 구조화된 요금제(직군별/신분별 필드), 회비 계산 로직
- 레거시 `membership_fee` 컬럼 drop (기존 후속 과제 그대로)
- `ClubDetailStats` 카드에 안내문 노출
- 모집공고 등 다른 화면의 회비 표기
- 마크다운/링크 렌더링 — 순수 텍스트 + 줄바꿈만
