'use client';

import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type {
  AdminUpdateClubPayload, ClubCategory, ClubDetail, ClubDayOfWeek, College,
} from '@duing/types';
import { updateClubSchema, adminUpdateClubSchema } from '@duing/schemas';
import { TagsInput } from './TagsInput';
import { SnsLinksRepeater } from './SnsLinksRepeater';
import { FaqsRepeater } from './FaqsRepeater';
import { HighlightsRepeater } from './HighlightsRepeater';
import { ProjectsRepeater } from './ProjectsRepeater';
import { ActiveDaysToggle } from './ActiveDaysToggle';
import { SectionCard } from '@/app/manage/_components/SectionCard';
import { LockedInput } from './LockedInput';
import { ContactVisibilityField } from './ContactVisibilityField';
import { FeeCycleSegment } from './FeeCycleSegment';
import { ClubProfilePreview, type ClubPreviewData } from './ClubProfilePreview';
import { DIVISIONS } from '../../../../../clubs/_lib/clubs';
import { COLLEGE_OPTIONS } from '../../../../../_lib/college';
import { ImageUploader } from '@/app/_components/ImageUploader';
import { ImageWithFallback } from '@/app/_components/ImageWithFallback';
import { NoticeRichEditorLazy } from '@/app/_components/NoticeRichEditorLazy';
import { sanitizeNoticeHtml } from '@/app/notices/_lib/sanitizeHtml';
import { PROSE_CLASS } from '@/app/notices/_components/NoticeContent';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { seedEditorHtml } from '../_lib/seedEditorHtml';

type ClubUpdateMutation = {
  mutateAsync: (payload: AdminUpdateClubPayload) => Promise<ClubDetail>;
  isPending: boolean;
};

type ClubInfoFormProps = {
  detail: ClubDetail;
  mode: 'leader' | 'officer' | 'admin';
  mutation: ClubUpdateMutation;
  onCancel?: () => void;
  onSaved?: () => void;
};

const CATEGORIES = ['ACADEMIC', 'CREATION', 'ART', 'SPORTS', 'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER'] as const;

const CATEGORY_LABELS: Record<ClubCategory, string> = {
  ACADEMIC: '학술',
  CREATION: '창작',
  ART: '예술',
  SPORTS: '운동',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

const LOCKED_NOTICE =
  '동아리명 · 카테고리 · 분과(또는 단과대학)는 총동연에서 관리하며 운영진은 수정할 수 없습니다. 학과는 운영진이 직접 수정할 수 있습니다.';

// 소개글 글자 수 정책 — 텍스트(getText) 기준. HTML 백스톱은 zod(clubProfileBaseSchema.description).
const DESCRIPTION_TEXT_LIMIT = 1500;

function isCategory(value: string): value is ClubCategory {
  return (CATEGORIES as readonly string[]).includes(value);
}

function collegeLabel(code: College | null): string {
  if (code === null) return '미지정';
  return COLLEGE_OPTIONS.find((option) => option.code === code)?.label ?? '미지정';
}

const inputCls =
  'w-full border border-[#cfcab8] bg-white rounded-[8px] px-3 py-2.5 text-[14px] text-[#2a2f27] placeholder:text-[#b8b8ac] transition-[border-color,box-shadow] focus:outline-none focus:border-[#4a6b3f] focus:shadow-[0_0_0_3px_rgba(74,107,63,0.15)]';

const selectCls =
  'w-full border border-[#cfcab8] bg-white rounded-[8px] px-3 py-2.5 text-[14px] text-[#2a2f27] appearance-none transition-[border-color] focus:outline-none focus:border-[#4a6b3f]';

const labelCls = 'block text-[13px] font-medium text-[#4a5247]';

const chevronStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%234a5247' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  backgroundSize: '12px',
  paddingRight: '36px',
} as const;

/** 라벨 + 본문 로컬 헬퍼. htmlFor 를 주면 실제 input 과 연결되는 label 로 렌더한다. */
function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelCls}>{label}</label>
      ) : (
        <span className={labelCls}>{label}</span>
      )}
      {children}
    </div>
  );
}

export function ClubInfoForm({ detail, mode, mutation, onCancel, onSaved }: ClubInfoFormProps) {
  const readOnly = mode === 'officer';
  const adminMode = mode === 'admin';

  // 잠금 필드 — adminMode 에서만 편집. leader/officer 는 detail 값을 그대로 표시한다.
  const [name, setName] = useState(detail.name);
  const [category, setCategory] = useState<ClubCategory>(detail.category);
  const [division, setDivision] = useState(detail.division ?? '');
  const [college, setCollege] = useState<College | ''>(detail.college ?? '');
  // 학과는 잠금 필드가 아니다 — 소속 학과는 운영진이 직접 최신으로 유지한다(단과대는 총동연 관리).
  const [department, setDepartment] = useState(detail.department ?? '');

  // 편집 진입 시 레거시 plain 소개는 <p> 로 변환해 시드한다(개행 소실 방지). value 는 마운트 시 1회만 읽힌다.
  const [seededDescription] = useState(() => seedEditorHtml(detail.description ?? ''));
  const [description, setDescription] = useState(seededDescription);
  const [descriptionTextLength, setDescriptionTextLength] = useState(0);
  // dirty 판정은 에디터가 시드로부터 처음 직렬화한 HTML(onCreate) 을 기준으로 한다 —
  // 에디터를 연 것만으로(변환·정규화 차이) 변경으로 오인해 저장되는 것을 막는다.
  const descriptionBaselineRef = useRef<string | null>(null);
  const [logoUrl, setLogoUrl] = useState(detail.logoUrl ?? '');
  const [coverUrl, setCoverUrl] = useState(detail.coverUrl ?? '');
  const [tags, setTags] = useState(detail.tags);
  const [snsLinks, setSnsLinks] = useState(detail.snsLinks);
  const [faqs, setFaqs] = useState(detail.faqs);
  const [foundedYear, setFoundedYear] = useState<string>(
    detail.foundedYear !== null ? String(detail.foundedYear) : '',
  );
  const [cohortNumber, setCohortNumber] = useState<string>(
    detail.cohortNumber !== null ? String(detail.cohortNumber) : '',
  );
  const [location, setLocation] = useState(detail.location ?? '');
  const [activityFrequency, setActivityFrequency] = useState<string>(
    detail.activityFrequency !== null ? String(detail.activityFrequency) : '',
  );
  const [activeDays, setActiveDays] = useState<ClubDayOfWeek[]>(detail.activeDays ?? []);
  const [tagline, setTagline] = useState(detail.tagline ?? '');
  const [highlights, setHighlights] = useState<string[]>(detail.highlights ?? []);
  const [contactVisibility, setContactVisibility] = useState(detail.contactVisibility);
  const [feeCycle, setFeeCycle] = useState(detail.feeCycle);
  const [feeAmount, setFeeAmount] = useState(
    detail.membershipFeeAmount !== null ? String(detail.membershipFeeAmount) : '',
  );
  const [feeNote, setFeeNote] = useState(detail.feeNote ?? '');
  const [projects, setProjects] = useState(detail.projects);
  const [useGeneration, setUseGeneration] = useState(detail.useGeneration);

  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const nextFeeAmount = feeCycle === 'NONE' ? null : feeAmount === '' ? null : Number(feeAmount);
  const parsedFoundedYear = foundedYear.trim() === '' ? null : Number(foundedYear);
  const parsedCohortNumber = cohortNumber.trim() === '' ? null : Number(cohortNumber);
  const parsedActivityFrequency = activityFrequency.trim() === '' ? null : Number(activityFrequency);
  const parsedDivision = division.trim() === '' ? null : division;
  const descriptionOverLimit = descriptionTextLength > DESCRIPTION_TEXT_LIMIT;

  function handleDescriptionChange(html: string, textLength: number) {
    // Tiptap 빈 문서는 getHTML()='<p></p>'(truthy)라 description||null·BE blankToNull 클리어를 우회한다.
    // 텍스트가 없으면 '' 로 정규화해 "소개 전부 삭제 = 클리어"(''→null) 경로를 타게 한다.
    const normalized = textLength === 0 ? '' : html;
    if (descriptionBaselineRef.current === null) descriptionBaselineRef.current = normalized;
    setDescription(normalized);
    setDescriptionTextLength(textLength);
  }

  // §6.5 — 저장 상태(detail) 기준으로 판정하므로 입력 중에는 조건이 유지된다.
  const showFeeMigrationNotice =
    detail.feeCycle === 'NONE' && detail.membershipFeeAmount === null && feeCycle === 'NONE';

  function buildPayload(): AdminUpdateClubPayload {
    const payload: AdminUpdateClubPayload = {};

    // 시드 변환본(에디터 첫 직렬화) 과 다를 때만 담는다 — 미터치 시 변환/정규화 차이로 오저장 방지.
    if (descriptionBaselineRef.current !== null && description !== descriptionBaselineRef.current) {
      payload.description = description;
    }
    if (logoUrl !== (detail.logoUrl ?? '')) {
      if (logoUrl === '') payload.clearLogoImage = true;
      else payload.logoUrl = logoUrl;
    }
    if (coverUrl !== (detail.coverUrl ?? '')) {
      if (coverUrl === '') payload.clearCoverImage = true;
      else payload.coverUrl = coverUrl;
    }
    if (JSON.stringify(tags) !== JSON.stringify(detail.tags)) payload.tags = tags;
    if (JSON.stringify(snsLinks) !== JSON.stringify(detail.snsLinks)) payload.snsLinks = snsLinks;
    if (JSON.stringify(faqs) !== JSON.stringify(detail.faqs)) payload.faqs = faqs;
    if (parsedFoundedYear !== detail.foundedYear) payload.foundedYear = parsedFoundedYear;
    if (parsedCohortNumber !== detail.cohortNumber) payload.cohortNumber = parsedCohortNumber;
    if (location !== (detail.location ?? '')) payload.location = location;
    if (parsedActivityFrequency !== detail.activityFrequency) {
      payload.activityFrequency = parsedActivityFrequency;
    }
    if (JSON.stringify(activeDays) !== JSON.stringify(detail.activeDays)) payload.activeDays = activeDays;
    if (tagline !== (detail.tagline ?? '')) payload.tagline = tagline;
    if (JSON.stringify(highlights) !== JSON.stringify(detail.highlights)) payload.highlights = highlights;
    if (contactVisibility !== detail.contactVisibility) payload.contactVisibility = contactVisibility;
    if (JSON.stringify(projects) !== JSON.stringify(detail.projects)) payload.projects = projects;
    // 기수 표시 여부 — 리더 전용(§9). adminMode 는 스위치를 렌더하지 않으므로 여기서도 담기지 않는다.
    if (useGeneration !== detail.useGeneration) payload.useGeneration = useGeneration;

    // 회비: 주기 또는 금액이 detail 과 다르면 항상 쌍으로 담는다 (§4.3).
    if (feeCycle !== detail.feeCycle || nextFeeAmount !== detail.membershipFeeAmount) {
      payload.feeCycle = feeCycle;
      payload.membershipFeeAmount = nextFeeAmount;
    }

    // 회비 안내문은 주기/금액 쌍과 독립 — 비우기는 '' 전송(BE blankToNull) (§clear-intent)
    if (feeNote !== (detail.feeNote ?? '')) payload.feeNote = feeNote;

    // 학과 — 중앙동아리는 입력 자체를 그리지 않으므로 담기지 않는다. 비우기는 '' 전송.
    if (!detail.centralClub && department !== (detail.department ?? '')) payload.department = department;

    // 잠금 필드 diff 는 adminMode 일 때만 — leader/officer 페이로드엔 절대 들어가지 않는다.
    if (adminMode) {
      if (name !== detail.name) payload.name = name;
      if (category !== detail.category) payload.category = category;
      // 비우기는 clear-intent 규약대로 '' 전송 — null 은 BE 부분수정에서 "미변경"이라 no-op 된다.
      if (parsedDivision !== (detail.division ?? null)) payload.division = parsedDivision ?? '';
      const nextCollege = college === '' ? null : college;
      if (nextCollege !== (detail.college ?? null)) {
        if (nextCollege === null) payload.clearCollege = true;
        else payload.college = nextCollege;
      }
    }

    return payload;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // 소개 텍스트 1,500자 초과는 인라인 에러(descriptionOverLimit)로 이미 노출 중 — 저장만 차단한다.
    if (descriptionOverLimit) return;

    const baseData = {
      description: description || null,
      logoUrl: logoUrl || null,
      coverUrl: coverUrl || null,
      tags,
      snsLinks,
      faqs,
      foundedYear: parsedFoundedYear,
      cohortNumber: parsedCohortNumber,
      location: location || null,
      activityFrequency: parsedActivityFrequency,
      activeDays,
      tagline: tagline || null,
      highlights,
      contactVisibility,
      feeCycle,
      // 유료 주기 + 빈 금액은 zod feePairRule 이 잡는다.
      membershipFeeAmount: nextFeeAmount,
      feeNote: feeNote || null,
      projects,
      department: department || null,
    };
    const parsed = adminMode
      ? adminUpdateClubSchema.safeParse({ ...baseData, name, category, division: parsedDivision })
      : updateClubSchema.safeParse(baseData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }

    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      setError('변경된 내용이 없습니다.');
      return;
    }

    try {
      await mutation.mutateAsync(payload);
      setSavedAt(new Date());
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  }

  const preview: ClubPreviewData = {
    name,
    logoUrl,
    coverUrl,
    cohortNumber: parsedCohortNumber,
    tagline,
    tags,
    foundedYear: parsedFoundedYear,
    activityFrequency: parsedActivityFrequency,
    activeDays,
    location,
    feeCycle,
    membershipFeeAmount: nextFeeAmount,
    feeNote,
    highlights,
  };

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-9 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-6">
      <form onSubmit={handleSubmit} className="min-w-0">
        <header className="mb-6 flex items-baseline gap-3">
          <h1 className="text-[26px] font-bold tracking-tight text-[#2a2f27]">동아리 정보</h1>
          <span className="font-mono text-[11px] tracking-[0.14em] text-[#8a8f83] uppercase">
            CLUB PROFILE
          </span>
        </header>

        {readOnly && (
          <p className="mb-5 text-[13px] text-[#8a8f83]">
            임원은 동아리 정보를 열람만 할 수 있어요. 수정은 회장(LEADER)만 가능합니다.
          </p>
        )}

        <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
          {/* ① 로고 · 커버 이미지 */}
          <SectionCard
            number={1}
            title="로고 · 커버 이미지"
            description="커버는 프로필 상단 배경, 로고는 카드 아바타로 노출돼요."
          >
            {readOnly ? (
              // 로고 1/3만 커버에 걸치는 히어로 프로필 규칙 — 편집·Preview 표면과 통일.
              <div className="relative mb-20">
                <ImageWithFallback
                  src={coverUrl}
                  alt="커버"
                  className="aspect-[16/9] overflow-hidden rounded-xl border border-line"
                  emptyMessage="커버 이미지가 없습니다"
                />
                <div className="absolute -bottom-14 left-5 w-[72px] overflow-hidden rounded-[16px] border-[3px] border-white bg-white shadow-lg sm:-bottom-16 sm:w-[96px]">
                  <ImageWithFallback
                    src={logoUrl}
                    alt="로고"
                    className="aspect-square overflow-hidden rounded-[13px]"
                    emptyMessage="로고"
                  />
                </div>
              </div>
            ) : (
              // 로고 1/3만 커버에 걸치는 히어로 규칙 — 이미지 액션은 각 이미지 우측 상단 플로팅 버튼으로.
              <div className="relative mb-20">
                <ImageUploader
                  variant="floating"
                  value={coverUrl}
                  onChange={setCoverUrl}
                  purpose="COVER"
                  aspectRatio="16/9"
                  altText="커버"
                  placeholder="커버 이미지를 업로드하세요 (권장 1200×675)"
                />
                {/* 칩 자체 overflow-hidden 은 플로팅 버튼·에러를 잘라 제거 — 클리핑은 내부 이미지 요소가 담당. */}
                <div className="absolute -bottom-14 left-5 w-[72px] rounded-[16px] border-[3px] border-white bg-white shadow-lg sm:-bottom-16 sm:w-[96px]">
                  <ImageUploader
                    variant="floating"
                    dense
                    value={logoUrl}
                    onChange={setLogoUrl}
                    purpose="LOGO"
                    aspectRatio="1/1"
                    altText="로고"
                    placeholder="로고"
                    previewClassName="rounded-[13px]"
                  />
                </div>
              </div>
            )}
          </SectionCard>

          {/* ② 기본 정보 */}
          <SectionCard number={2} title="기본 정보" description={adminMode ? undefined : LOCKED_NOTICE}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {adminMode ? (
                <>
                  <Field label="동아리명" htmlFor="f-name">
                    <input
                      id="f-name"
                      type="text"
                      value={name}
                      maxLength={100}
                      onChange={(event) => setName(event.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="카테고리" htmlFor="f-cat">
                    <select
                      id="f-cat"
                      value={category}
                      onChange={(event) => {
                        if (isCategory(event.target.value)) setCategory(event.target.value);
                      }}
                      className={selectCls}
                      style={chevronStyle}
                    >
                      {CATEGORIES.map((code) => (
                        <option key={code} value={code}>{CATEGORY_LABELS[code]}</option>
                      ))}
                    </select>
                  </Field>
                  {detail.centralClub ? (
                    <Field label="분과" htmlFor="f-div">
                      <select
                        id="f-div"
                        value={division}
                        onChange={(event) => setDivision(event.target.value)}
                        className={selectCls}
                        style={chevronStyle}
                      >
                        <option value="">분과 선택</option>
                        {DIVISIONS.map((option) => (
                          <option key={option} value={option}>{option}분과</option>
                        ))}
                      </select>
                    </Field>
                  ) : (
                    <Field label="단과대학" htmlFor="f-college">
                      <select
                        id="f-college"
                        value={college}
                        onChange={(event) =>
                          setCollege(
                            COLLEGE_OPTIONS.find((option) => option.code === event.target.value)?.code ?? '',
                          )
                        }
                        className={selectCls}
                        style={chevronStyle}
                      >
                        <option value="">단과대학 선택</option>
                        {COLLEGE_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                </>
              ) : (
                <>
                  <Field label="동아리명"><LockedInput value={detail.name} /></Field>
                  <Field label="카테고리"><LockedInput value={CATEGORY_LABELS[detail.category]} /></Field>
                  {detail.centralClub ? (
                    <Field label="분과"><LockedInput value={detail.division ?? '미지정'} /></Field>
                  ) : (
                    <Field label="단과대학"><LockedInput value={collegeLabel(detail.college)} /></Field>
                  )}
                </>
              )}
            </div>

            {/* 학과는 단과대 동아리에만 해당하고, 단과대학과 달리 운영진이 직접 수정한다. */}
            {!detail.centralClub && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="학과" htmlFor="f-department">
                  {readOnly ? (
                    <LockedInput value={detail.department ?? '미지정'} />
                  ) : (
                    <input
                      id="f-department"
                      type="text"
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      maxLength={50}
                      placeholder="예: 회계학과"
                      className={inputCls}
                    />
                  )}
                </Field>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="창설년도" htmlFor="f-year">
                <input
                  id="f-year"
                  type="number"
                  min={1900}
                  max={2100}
                  value={foundedYear}
                  onChange={(event) => setFoundedYear(event.target.value)}
                  placeholder="예: 2018"
                  className={inputCls}
                />
              </Field>
              <Field label="현재 기수" htmlFor="f-gen">
                <input
                  id="f-gen"
                  type="number"
                  min={1}
                  value={cohortNumber}
                  onChange={(event) => setCohortNumber(event.target.value)}
                  placeholder="예: 10"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="동아리방 위치" htmlFor="f-loc">
                <input
                  id="f-loc"
                  type="text"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="예: 학생회관 405호"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="대표 연락처">
                <ContactVisibilityField
                  phone={detail.contactPhone}
                  value={contactVisibility}
                  onChange={setContactVisibility}
                  disabled={readOnly}
                />
              </Field>
            </div>
          </SectionCard>

          {/* ③ 활동 요일 · 빈도 · 회비 */}
          <SectionCard number={3} title="활동 요일 · 빈도 · 회비">
            <Field label="활동 요일 / 빈도">
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <ActiveDaysToggle value={activeDays} onChange={setActiveDays} disabled={readOnly} />
                <span className="mx-1 h-5 w-px bg-[#d9d4c3]" />
                <span className="text-[13px] text-[#4a5247]">주</span>
                <input
                  type="number"
                  min={1}
                  aria-label="주간 활동 횟수"
                  value={activityFrequency}
                  onChange={(event) => setActivityFrequency(event.target.value)}
                  className="w-14 rounded-[8px] border border-[#cfcab8] bg-white px-2 py-1.5 text-center text-[13.5px] focus:border-[#4a6b3f] focus:outline-none"
                />
                <span className="text-[13px] text-[#4a5247]">회</span>
              </div>
            </Field>

            <div className="mt-4">
              <Field label="회비">
                {showFeeMigrationNotice && (
                  <p className="mb-2 text-[12px] text-[#8a6d3b]">
                    회비 정보가 새 형식으로 개편되었어요. 회비가 있다면 금액과 주기를, 없다면 &apos;회비 없음&apos;을 선택해 주세요.
                  </p>
                )}
                <FeeCycleSegment
                  value={feeCycle}
                  onChange={(next) => {
                    setFeeCycle(next);
                    if (next === 'NONE') setFeeAmount('');
                  }}
                  disabled={readOnly}
                />
                {feeCycle !== 'NONE' && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      aria-label="회비 금액"
                      value={feeAmount}
                      onChange={(event) => setFeeAmount(event.target.value)}
                      placeholder="30000"
                      disabled={readOnly}
                      className="w-[120px] rounded-[8px] border border-[#cfcab8] bg-white px-3 py-2 text-[14px] focus:border-[#4a6b3f] focus:outline-none"
                    />
                    <span className="text-[13px] text-[#4a5247]">원</span>
                  </div>
                )}
                {/* 회비 안내문 — 주기가 '회비 없음'이어도 항상 입력 가능(분야별·신규/기존 차등 안내). */}
                <div className="mt-3 flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="f-fee-note" className={labelCls}>회비 안내 (선택)</label>
                    <span className="text-[11.5px] font-medium text-[#8a8f83]">{feeNote.length}/150</span>
                  </div>
                  <textarea
                    id="f-fee-note"
                    value={feeNote}
                    maxLength={150}
                    rows={4}
                    onChange={(event) => setFeeNote(event.target.value)}
                    placeholder={'선수 : 학기당 30,000원\n매니저 : 학기당 15,000원\n\n신규 회원은 첫 학기만 5,000원이 추가됩니다.'}
                    className="w-full resize-none rounded-[8px] border border-[#cfcab8] bg-white px-3 py-2 text-[14px] leading-relaxed focus:border-[#4a6b3f] focus:outline-none"
                  />
                  <p className="text-[12px] text-[#8a8f83]">
                    모집 분야별 또는 신규/기존 회원 등 회비가 다른 경우 자유롭게 안내해 주세요.
                  </p>
                </div>
              </Field>
            </div>
          </SectionCard>

          {/* ④ 소개 */}
          <SectionCard number={4} title="소개">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="f-tagline" className={labelCls}>한줄 소개</label>
                <span
                  className={`text-[11.5px] font-medium ${
                    tagline.length > 20 ? 'text-[#b04a2a]' : 'text-[#8a8f83]'
                  }`}
                >
                  {tagline.length}/20
                </span>
              </div>
              <input
                id="f-tagline"
                type="text"
                value={tagline}
                maxLength={20}
                onChange={(event) => setTagline(event.target.value)}
                placeholder="예: 코드로 함께 성장하는 동아리"
                className={inputCls}
              />
              {tagline.length > 20 && (
                <p className="mt-1 text-[12px] text-[#b04a2a]">
                  기존에 저장된 소개가 20자를 초과합니다. 20자 이내로 줄이는 것을 권장해요.
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className={labelCls}>
                  해시태그 <span className="text-[11.5px] font-normal text-[#8a8f83]">(최대 5개)</span>
                </span>
                <span
                  className={`text-[11.5px] font-medium ${
                    tags.length > 5 ? 'text-[#b04a2a]' : tags.length === 5 ? 'text-[#3e5b34]' : 'text-[#8a8f83]'
                  }`}
                >
                  {tags.length}/5
                </span>
              </div>
              <TagsInput value={tags} onChange={setTags} readOnly={readOnly} />
              {tags.length > 5 && (
                <p className="mt-1.5 text-[12px] text-[#b04a2a]">
                  이전에 등록된 태그가 5개를 초과합니다. 새 태그를 추가하려면 먼저 일부를 삭제해 주세요.
                </p>
              )}
              {tags.length === 5 && (
                <p className="mt-1.5 text-[12px] text-[#8a8f83]">최대 5개까지 추가할 수 있어요.</p>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className={labelCls}>동아리 소개</span>
                {!readOnly && (
                  <span
                    className={`text-[11.5px] font-medium ${
                      descriptionOverLimit ? 'text-[#b04a2a]' : 'text-[#8a8f83]'
                    }`}
                  >
                    {`${descriptionTextLength.toLocaleString()}/1,500 · 권장 300~800자`}
                  </span>
                )}
              </div>
              {readOnly ? (
                seededDescription ? (
                  <div
                    className={`${PROSE_CLASS} rounded-xl border border-line bg-paper px-5 py-4`}
                    // eslint-disable-next-line react/no-danger -- sanitizeNoticeHtml 로 정화한 HTML 만 주입
                    dangerouslySetInnerHTML={{ __html: sanitizeNoticeHtml(seededDescription) }}
                  />
                ) : (
                  <p className="text-[13px] text-[#8a8f83]">등록된 소개가 없습니다.</p>
                )
              ) : (
                <>
                  <NoticeRichEditorLazy
                    value={seededDescription}
                    format="HTML"
                    onChange={handleDescriptionChange}
                    features={{ headings: false, image: false, code: false }}
                  />
                  {descriptionOverLimit && (
                    <p className="mt-1 text-[12px] text-[#b04a2a]">
                      소개글은 1,500자 이하로 줄여주세요.
                    </p>
                  )}
                </>
              )}
            </div>
          </SectionCard>

          {/* ⑤ 이런 사람이 좋아할 거예요 */}
          <SectionCard
            number={5}
            title="이런 사람이 좋아할 거예요"
            description="지원 전 핏을 판단하도록 돕는 문구예요. 최대 7줄."
          >
            <HighlightsRepeater value={highlights} onChange={setHighlights} readOnly={readOnly} />
          </SectionCard>

          {/* ⑥ 이런 활동을 해요 */}
          <SectionCard
            number={6}
            title="이런 활동을 해요"
            description="학생들이 동아리의 활동을 한눈에 이해할 수 있게 대표적인 활동을 등록해 주세요. 최대 6개."
          >
            <ProjectsRepeater value={projects} onChange={setProjects} readOnly={readOnly} />
          </SectionCard>

          {/* ⑦ SNS · 외부 링크 */}
          <SectionCard number={7} title="SNS · 외부 링크" description="Instagram · 카카오톡 · Facebook · 기타 링크를 최대 10개까지 등록해요.">
            <SnsLinksRepeater value={snsLinks} onChange={setSnsLinks} readOnly={readOnly} />
          </SectionCard>

          {/* ⑧ FAQ */}
          <SectionCard number={8} title="자주 묻는 질문" description="지원자 문의를 줄여줘요.">
            <FaqsRepeater value={faqs} onChange={setFaqs} readOnly={readOnly} />
          </SectionCard>

          {/* ⑨ 회원 기수 관리 — 리더 전용. adminMode 는 BE 가 useGeneration 을 null 처리(무시)하므로 렌더하지 않는다. */}
          {!adminMode && (
            <SectionCard
              number={9}
              title="회원 기수 관리"
              description="회원별 기수를 관리해요. 끄면 기수 관련 화면이 숨겨지고, 기존 기수 데이터는 보존됩니다."
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={useGeneration}
                  aria-label="회원 기수 관리 사용"
                  onClick={() => setUseGeneration((prev) => !prev)}
                  className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors disabled:cursor-default disabled:opacity-60 ${
                    useGeneration ? 'bg-[#4a6b3f]' : 'bg-[#cfcab8]'
                  }`}
                >
                  <span
                    className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left] ${
                      useGeneration ? 'left-[23px]' : 'left-[3px]'
                    }`}
                  />
                </button>
                <span className="text-[13.5px] font-medium text-[#4a5247]">
                  {useGeneration ? '사용 중' : '사용 안 함'}
                </span>
              </div>
            </SectionCard>
          )}

          {error && <p className="mt-2 text-[13px] text-[#b35a3a]">{error}</p>}
          {savedAt && !error && (
            <p className="mt-2 text-[13px] text-[#3e5b34]">저장됨 ({savedAt.toLocaleTimeString()})</p>
          )}

          {!readOnly && (
            <div className="mt-6 flex items-center gap-2">
              <button type="submit" disabled={mutation.isPending} className="btn btn-primary disabled:opacity-50">
                {mutation.isPending && <ButtonSpinner />}저장
              </button>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={mutation.isPending}
                  className="rounded-[8px] border border-[#cfcab8] px-4 py-2 text-[14px] text-[#4a5247] hover:bg-[#f5f3ec] disabled:opacity-50"
                >
                  취소
                </button>
              )}
            </div>
          )}
        </fieldset>
      </form>

      {/* 우측 Sticky Preview — xl 미만 숨김 (§7) */}
      <aside className="hidden xl:sticky xl:top-6 xl:block">
        <ClubProfilePreview preview={preview} />
      </aside>
    </div>
  );
}
