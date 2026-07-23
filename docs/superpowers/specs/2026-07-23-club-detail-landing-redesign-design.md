# 동아리 상세(학생) 랜딩 리디자인 — 대표 활동 + "이런 활동을 해요"

**Date:** 2026-07-23
**Scope:** FE 단독 1 PR (`feat/club-detail-landing`). BE·데이터 모델·API 무변경.

## 목표

동아리 상세 페이지 상단에 **랜딩 콘텐츠** 두 섹션을 만든다. 대표 활동(사진 몰입형 홍보 피드)에서 "재밌겠다"를, "이런 활동을 해요"(활동 소개 카드)에서 "이런 활동을 하는구나"를 5초 안에 전달한다. 랜딩(첫인상)과 탭(상세 탐색)의 역할을 분리한다.

## 정보 구조 (확정)

- **PC**: Hero → Stats → **대표 활동(벤토)** → **이런 활동을 해요** → Tabs. 우측 모집 카드·연락처 카드 무변경.
- **모바일**: Hero → Stats → 모집 요약(기존 md:hidden) → **대표 활동(HeroSwipe)** → **이런 활동을 해요** → Tabs. 하단 Sticky Footer CTA(ClubDetailApplyBar) **무접촉**.
- 소개 탭: "주요 프로젝트" 리스트 제거. `hasIntro` 조건에서 `projects` 제외 — description·highlights 없이 projects만 있던 동아리는 소개 탭이 사라진다(콘텐츠는 랜딩으로 이동, 손실 없음).

## 1. 대표 활동 섹션 (신규)

### 데이터·로딩
- 기존 공개 훅 `useClubHeroActivitiesQuery(clubId)` 재사용 (BE #743 라이브).
- **페이지 로딩을 막지 않는다** — 섹션 독립 로딩. 로딩 중에는 해당 섹션 자리에만 Skeleton(공용 `components/loading` 체계, delayed-show 컨벤션 준수 — 벤토/스와이프 자리 모양의 4:5 블록).
- 로드 완료 후 **0개면 섹션 미렌더**(헤더 포함). 쿼리 에러 시에도 미렌더(랜딩은 조용히 강등 — 상세 페이지 본문은 정상).

### 카드 — HeroActivityCard 승격·공유
- 콘솔 `manage/.../photos/_components/HeroActivityCard`를 공용 위치로 승격(2번째 소비처 발생 규칙). 콘솔 Preview·슬롯 에디터는 import 경로만 변경.
- prop 확장 2건(기존 소비처 무변경):
  - `size?: 'default' | 'big'` — 벤토 첫 카드(2×2)의 타이포·배지 스케일 업.
  - `slotNumber?: number` — **미전달 시 번호 배지 미렌더**. 학생 화면은 배지 없이(사진·콘텐츠 집중), 콘솔 슬롯 에디터는 유지.
  - ※ 콘솔 ActivityPreview(학생 미리보기)는 "학생 화면 그대로" 약속이므로 **배지 제거로 학생 화면과 일치**시킨다(콘솔 내 변경이지만 미리보기 정합 목적 — 리뷰 시 확인 포인트).

### PC 벤토 (`hidden md:block`)
개수별 배치(목업 Concept A 규칙):
- 5~6개: 3열 그리드, 첫 카드 `col-span-2 row-span-2` 큰 대표(size big), 나머지 4:5.
- 4개: 2열 2×2 / 3개: 3열 / 2개: 2열(최대폭 640px) / 1개: 단독(최대폭 320px).
- displayOrder 오름차순 **컴팩트 정렬**(빈 슬롯 개념 없음, 배지 없음).
- 섹션 헤더: 제목 "대표 활동" + 서브 "{동아리명}을(를) 가장 잘 보여주는 순간들".

### 모바일 HeroSwipe (`md:hidden`)
- CSS scroll-snap 기반(라이브러리·포인터 캡처 없음): 풀폭 4:5 카드 한 장씩, `scroll-snap-type: x mandatory`.
- 도트 인디케이터: 현재 도트 길게(w 확대), 클릭 시 `scrollTo` — **reduced-motion 시 `behavior:'auto'`**.
- 레포 함정 가드(필수): 카드 이미지 `draggable={false}` + 스와이프 컨테이너 `onDragStart` preventDefault. jsdom이 못 잡으므로 실브라우저 QA 항목.

### 클릭 → Lightbox (일반화 재사용)
- `PhotoLightbox`를 슬라이드 일반형으로 리팩터: 입력을 `{ id, imageUrl, title: string | null, caption: string | null }[]`로 받고, `title` 있으면 캡션 영역에 굵은 제목 줄 + 설명을 렌더.
- 기존 활동 사진 소비처(`ClubDetailPhotos`)는 1줄 map 어댑터로 무변경 동작(회귀 테스트 유지). 스와이프·키보드(←/→)·아래로 끌어 닫기·reduced-motion 로직 공유.
- 대표 활동 클릭(벤토·스와이프 공통) → 해당 인덱스로 Lightbox 오픈.

## 2. "이런 활동을 해요" 섹션 (리디자인)

- 신규 `ClubDetailActivityIntro`(랜딩 전용). 데이터 `club.projects` 그대로(아이콘 enum + 활동명 + 한 줄 설명 nullable) — **모델·API·편집 UI 무변경**.
- 카드 그리드: PC 3열 / 모바일 2열. paper 카드(radius 18급·shadow-1) + 아이콘 배지(sage-mist, 기존 `projectCardTone` 순환 톤 재활용) + 활동명(semibold) + 한 줄 설명(2줄 클램프, null이면 생략). KPI·수치 강조 없음.
- 섹션 헤더: "이런 활동을 해요". 0개면 섹션 미렌더.

## 3. 운영진 콘솔 리네임 (텍스트만)

`ClubInfoForm` ⑥섹션 — 제목 "이런 활동을 해요", 설명 "학생들이 동아리의 활동을 한눈에 이해할 수 있게 대표적인 활동을 등록해 주세요. 최대 6개." 모델·API·편집 UI·입력 방식 무변경.

## 테스트

- **단위(jsdom)**: 벤토 개수별(1·2·3·4·5·6) 배치 클래스·컴팩트 순서, 배지 부재, 0개/에러 미렌더, 스켈레톤 표시, 스와이프 도트-인덱스 동기(scroll 이벤트 시뮬), Lightbox 제목+설명 렌더 + 기존 사진 캡션 회귀, 소개 탭 projects 제거, `hasIntro` 조건 변경(projects만 있는 동아리 → 소개 탭 미노출·다음 탭이 첫 탭), 콘솔 ⑥ 문구.
- **탭 회귀 QA(수정사항 3)**: 초기 탭 선택(소개 탭 소멸 시 다음 탭이 defaultValue), 탭 노출 조건 조합, 멤버 전용 공지·일정 탭 무영향. 딥링크는 현재 미구현(검증 완료 — searchParams 사용 없음)이라 해당 없음.
- **실브라우저 QA**: 모바일 스와이프(터치·도트), md 경계에서 벤토↔스와이프 전환, Lightbox(사진·대표활동 양쪽), Sticky Footer CTA 무영향, 스켈레톤 → 콘텐츠 전환 layout shift 확인.

## Out of Scope

- 나머지 섹션(소개 본문·공지·일정·Q&A·모집 카드·연락처) 및 Sticky Footer CTA 일체.
- 활동 탭의 기존 "활동 사진" 그리드(유지 — 대표 활동과 역할 다름).
- SSR/SEO(페이지는 기존대로 CSR), 대표 활동 부재 시 대체 콘텐츠, 모바일 벤토(모바일은 스와이프 단일).
- BE 변경 일체(공개 API·projects 모델 그대로).
- 홈(메인) 화면의 대표 활동 노출 — 별도 후속.
