'use client';

import { useState } from 'react';
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
import { SectionCard } from './SectionCard';
import { LockedInput } from './LockedInput';
import { ContactVisibilityField } from './ContactVisibilityField';
import { FeeCycleSegment } from './FeeCycleSegment';
import { ClubProfilePreview, type ClubPreviewData } from './ClubProfilePreview';
import { DIVISIONS } from '../../../../../clubs/_lib/clubs';
import { COLLEGE_OPTIONS } from '../../../../../_lib/college';
import { ImageUploader } from '@/app/_components/ImageUploader';
import { ImageWithFallback } from '@/app/_components/ImageWithFallback';
import { ButtonSpinner } from '@/components/loading/Spinner';

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

const CATEGORIES = ['ACADEMIC', 'CULTURE', 'ART', 'SPORTS', 'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER'] as const;

const CATEGORY_LABELS: Record<ClubCategory, string> = {
  ACADEMIC: '학술',
  CULTURE: '문화',
  ART: '예술',
  SPORTS: '체육',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

const LOCKED_NOTICE =
  '동아리명 · 카테고리 · 분과(또는 단과대학)는 총동연에서 관리하며 운영진은 수정할 수 없습니다.';

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

  const [description, setDescription] = useState(detail.description ?? '');
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
  const [projects, setProjects] = useState(detail.projects);

  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const nextFeeAmount = feeCycle === 'NONE' ? null : feeAmount === '' ? null : Number(feeAmount);
  const parsedFoundedYear = foundedYear.trim() === '' ? null : Number(foundedYear);
  const parsedCohortNumber = cohortNumber.trim() === '' ? null : Number(cohortNumber);
  const parsedActivityFrequency = activityFrequency.trim() === '' ? null : Number(activityFrequency);
  const parsedDivision = division.trim() === '' ? null : division;

  // §6.5 — 저장 상태(detail) 기준으로 판정하므로 입력 중에는 조건이 유지된다.
  const showFeeMigrationNotice =
    detail.feeCycle === 'NONE' && detail.membershipFeeAmount === null && feeCycle === 'NONE';

  function buildPayload(): AdminUpdateClubPayload {
    const payload: AdminUpdateClubPayload = {};

    if (description !== (detail.description ?? '')) payload.description = description;
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

    // 회비: 주기 또는 금액이 detail 과 다르면 항상 쌍으로 담는다 (§4.3).
    if (feeCycle !== detail.feeCycle || nextFeeAmount !== detail.membershipFeeAmount) {
      payload.feeCycle = feeCycle;
      payload.membershipFeeAmount = nextFeeAmount;
    }

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
      projects,
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
              <>
                <div className="relative">
                  <ImageWithFallback
                    src={coverUrl}
                    alt="커버"
                    className="aspect-[16/9] overflow-hidden rounded-xl border border-line"
                    emptyMessage="커버 이미지를 업로드하세요 (권장 1200×675)"
                  />
                  {/* 로고 1/3만 커버에 걸침 — 히어로 프로필 규칙(좁아질수록 걸침 얕게). 칩에는 이미지만 그린다. */}
                  <div className="absolute -bottom-14 left-5 w-[72px] overflow-hidden rounded-[16px] border-[3px] border-white bg-white shadow-lg sm:-bottom-16 sm:w-[96px]">
                    <ImageWithFallback
                      src={logoUrl}
                      alt="로고"
                      className="aspect-square overflow-hidden rounded-[13px]"
                      emptyMessage="로고"
                    />
                  </div>
                </div>
                {/* 업로드 컨트롤 — 커버에 걸친 칩을 피해 오른쪽 흐름에 배치 */}
                <div className="mb-4 ml-[104px] mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 sm:ml-[132px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-medium text-[#4a5247]">커버</span>
                    <ImageUploader
                      value={coverUrl}
                      onChange={setCoverUrl}
                      purpose="COVER"
                      aspectRatio="16/9"
                      altText="커버"
                      controlsOnly
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-medium text-[#4a5247]">로고</span>
                    <ImageUploader
                      value={logoUrl}
                      onChange={setLogoUrl}
                      purpose="LOGO"
                      aspectRatio="1/1"
                      altText="로고"
                      controlsOnly
                    />
                  </div>
                </div>
              </>
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
              <label htmlFor="f-intro" className={labelCls}>동아리 소개</label>
              <textarea
                id="f-intro"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                placeholder="동아리 활동, 분위기, 지원자에게 전하고 싶은 이야기를 자유롭게 적어주세요."
                className={`${inputCls} resize-y leading-relaxed`}
              />
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

          {/* ⑥ 주요 프로젝트 */}
          <SectionCard number={6} title="주요 프로젝트" description="동아리 대표 활동·결과물을 보여줘요. 최대 6개.">
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
