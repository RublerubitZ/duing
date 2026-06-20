'use client';

import { useState } from 'react';
import type { ClubDetail, ClubDayOfWeek, College, UpdateClubPayload } from '@duing/types';
import { updateClubSchema } from '@duing/schemas';
import { useUpdateClubMutation } from '@duing/hooks';
import { TagsInput } from './TagsInput';
import { SnsLinksRepeater } from './SnsLinksRepeater';
import { FaqsRepeater } from './FaqsRepeater';
import { HighlightsRepeater } from './HighlightsRepeater';
import { ActiveDaysToggle } from './ActiveDaysToggle';
import { DIVISIONS } from '../../../../../clubs/_lib/clubs';
import { COLLEGE_OPTIONS } from '../../../../../_lib/college';
import { ImageUploader } from '@/app/_components/ImageUploader';
import { ImageWithFallback } from '@/app/_components/ImageWithFallback';

type ClubInfoFormProps = {
  clubId: number;
  detail: ClubDetail;
  readOnly: boolean;
};

const CATEGORIES = ['ACADEMIC', 'CULTURE', 'ART', 'SPORTS', 'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER'] as const;
type CategoryLiteral = (typeof CATEGORIES)[number];

const CATEGORY_LABELS: Record<CategoryLiteral, string> = {
  ACADEMIC: '학술',
  CULTURE: '문화',
  ART: '예술',
  SPORTS: '체육',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

function isCategory(value: string): value is CategoryLiteral {
  return (CATEGORIES as readonly string[]).includes(value);
}

const inputCls =
  'w-full border border-[#cfcab8] bg-white rounded-[8px] px-3 py-2.5 text-[14px] text-[#2a2f27] placeholder:text-[#b8b8ac] transition-[border-color,box-shadow] focus:outline-none focus:border-[#4a6b3f] focus:shadow-[0_0_0_3px_rgba(74,107,63,0.15)]';

const selectCls =
  'w-full border border-[#cfcab8] bg-white rounded-[8px] px-3 py-2.5 text-[14px] text-[#2a2f27] appearance-none transition-[border-color] focus:outline-none focus:border-[#4a6b3f]';

const labelCls = 'block text-[13px] font-medium text-[#4a5247]';

const fieldCls = 'flex flex-col gap-1.5 mb-[18px]';

const groupCardCls =
  'relative border border-[#d9d4c3] rounded-[10px] pt-[22px] px-[22px] pb-6 bg-white mt-2 mb-[22px] space-y-[18px]';

const groupLegendCls =
  'absolute -top-[10px] left-4 bg-white px-2 text-[12px] font-semibold text-[#3e5b34] tracking-[0.02em]';

export function ClubInfoForm({ clubId, detail, readOnly }: ClubInfoFormProps) {
  const [name, setName] = useState(detail.name);
  const [category, setCategory] = useState(detail.category);
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
  const [contactEmail, setContactEmail] = useState(detail.contactEmail ?? '');
  const [activityFrequency, setActivityFrequency] = useState<string>(
    detail.activityFrequency !== null ? String(detail.activityFrequency) : '',
  );
  const [activeDays, setActiveDays] = useState<ClubDayOfWeek[]>(detail.activeDays ?? []);
  const [membershipFee, setMembershipFee] = useState(detail.membershipFee ?? '');
  const [tagline, setTagline] = useState(detail.tagline ?? '');
  const [highlights, setHighlights] = useState<string[]>(detail.highlights ?? []);
  const [majorProjects, setMajorProjects] = useState(detail.majorProjects ?? '');

  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const mutation = useUpdateClubMutation(clubId);

  function buildPayload(): UpdateClubPayload {
    const payload: UpdateClubPayload = {};
    if (name !== detail.name) payload.name = name;
    if (category !== detail.category) payload.category = category;
    if (division !== (detail.division ?? '')) payload.division = division || null;
    const previousCollege: College | '' = detail.college ?? '';
    if (college !== previousCollege) {
      if (college === '') {
        payload.clearCollege = true;
      } else {
        payload.college = college;
      }
    }
    if (description !== (detail.description ?? '')) payload.description = description || null;
    if (logoUrl !== (detail.logoUrl ?? '')) payload.logoUrl = logoUrl || null;
    if (coverUrl !== (detail.coverUrl ?? '')) payload.coverUrl = coverUrl || null;
    if (JSON.stringify(tags) !== JSON.stringify(detail.tags)) payload.tags = tags;
    if (JSON.stringify(snsLinks) !== JSON.stringify(detail.snsLinks)) payload.snsLinks = snsLinks;
    if (JSON.stringify(faqs) !== JSON.stringify(detail.faqs)) payload.faqs = faqs;
    const newFoundedYear = foundedYear.trim() === '' ? null : Number(foundedYear);
    if (newFoundedYear !== detail.foundedYear) payload.foundedYear = newFoundedYear;
    const newCohortNumber = cohortNumber.trim() === '' ? null : Number(cohortNumber);
    if (newCohortNumber !== detail.cohortNumber) payload.cohortNumber = newCohortNumber;
    if (location !== (detail.location ?? '')) payload.location = location || null;
    if (contactEmail !== (detail.contactEmail ?? '')) payload.contactEmail = contactEmail || null;
    const newActivityFrequency = activityFrequency.trim() === '' ? null : Number(activityFrequency);
    if (newActivityFrequency !== detail.activityFrequency) payload.activityFrequency = newActivityFrequency;
    if (JSON.stringify(activeDays) !== JSON.stringify(detail.activeDays)) payload.activeDays = activeDays;
    if (membershipFee !== (detail.membershipFee ?? '')) payload.membershipFee = membershipFee || null;
    if (tagline !== (detail.tagline ?? '')) payload.tagline = tagline || null;
    if (JSON.stringify(highlights) !== JSON.stringify(detail.highlights)) payload.highlights = highlights;
    if (majorProjects !== (detail.majorProjects ?? '')) payload.majorProjects = majorProjects || null;
    return payload;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const fullData = {
      name,
      category,
      division: division || null,
      description: description || null,
      logoUrl: logoUrl || null,
      coverUrl: coverUrl || null,
      tags,
      snsLinks,
      faqs,
      foundedYear: foundedYear.trim() === '' ? null : Number(foundedYear),
      cohortNumber: cohortNumber.trim() === '' ? null : Number(cohortNumber),
      location: location || null,
      contactEmail: contactEmail || '',
      activityFrequency: activityFrequency.trim() === '' ? null : Number(activityFrequency),
      activeDays,
      membershipFee: membershipFee || null,
      tagline: tagline || null,
      highlights,
      majorProjects: majorProjects || null,
    };
    const parsed = updateClubSchema.safeParse(fullData);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-12 py-9 pb-20">
      <div className="max-w-[720px] mx-auto">

        <header className="flex items-baseline gap-3 mb-7">
          <h1 className="text-[26px] font-bold tracking-tight text-[#2a2f27]">동아리 정보</h1>
          <span className="font-mono text-[11px] tracking-[0.14em] text-[#8a8f83] uppercase">
            ADMIN · CLUB INFO
          </span>
        </header>

        {readOnly && (
          <p className="mb-5 text-[12px] text-[#8a8f83]">
            OFFICER 는 읽기만 가능합니다. 수정은 LEADER 만 할 수 있습니다.
          </p>
        )}

        {/* 기본 정보 */}
        <fieldset disabled={readOnly} className="border-0 p-0 m-0 space-y-0">
          <div className={fieldCls}>
            <label htmlFor="f-name" className={labelCls}>이름</label>
            <input
              id="f-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputCls}
            />
          </div>

          <div className={fieldCls}>
            <label htmlFor="f-cat" className={labelCls}>카테고리</label>
            <select
              id="f-cat"
              value={category}
              onChange={(event) => {
                const next = event.target.value;
                if (isCategory(next)) setCategory(next);
              }}
              className={selectCls}
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%234a5247' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
                backgroundSize: '12px',
                paddingRight: '36px',
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {detail.centralClub ? (
            <div className={fieldCls}>
              <label htmlFor="f-div" className={labelCls}>분과</label>
              <select
                id="f-div"
                value={division}
                onChange={(event) => setDivision(event.target.value)}
                className={selectCls}
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%234a5247' d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")",
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  backgroundSize: '12px',
                  paddingRight: '36px',
                }}
              >
                <option value="">분과 선택</option>
                {DIVISIONS.map((option) => (
                  <option key={option} value={option}>{option}분과</option>
                ))}
              </select>
            </div>
          ) : (
            <div className={fieldCls}>
              <label htmlFor="f-college" className={labelCls}>단과대학</label>
              <select
                id="f-college"
                value={college}
                onChange={(event) => setCollege(event.target.value as College | '')}
                className={selectCls}
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%234a5247' d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")",
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  backgroundSize: '12px',
                  paddingRight: '36px',
                }}
              >
                <option value="">단과대학 선택</option>
                {COLLEGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className={fieldCls}>
            <label htmlFor="f-intro" className={labelCls}>소개</label>
            <textarea
              id="f-intro"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className={`${inputCls} resize-y leading-relaxed`}
            />
          </div>

          <div className={fieldCls}>
            <p className={labelCls}>로고 이미지</p>
            {readOnly ? (
              <ImageWithFallback
                src={logoUrl}
                alt="로고"
                className="aspect-square rounded-xl overflow-hidden border border-line max-w-[240px]"
                emptyMessage="로고 이미지가 없습니다"
              />
            ) : (
              <div className="max-w-[240px]">
                <ImageUploader
                  value={logoUrl}
                  onChange={setLogoUrl}
                  purpose="LOGO"
                  aspectRatio="1/1"
                  placeholder="로고 이미지를 업로드하세요"
                  altText="로고"
                />
              </div>
            )}
          </div>

          <div className={fieldCls}>
            <p className={labelCls}>커버 이미지</p>
            {readOnly ? (
              <ImageWithFallback
                src={coverUrl}
                alt="커버"
                className="aspect-[16/9] rounded-xl overflow-hidden border border-line"
                emptyMessage="커버 이미지가 없습니다"
              />
            ) : (
              <ImageUploader
                value={coverUrl}
                onChange={setCoverUrl}
                purpose="COVER"
                aspectRatio="16/9"
                placeholder="커버 이미지를 업로드하세요"
                altText="커버"
              />
            )}
          </div>
        </fieldset>

        <div className={fieldCls}>
          <div className="flex items-baseline justify-between">
            <span className={labelCls}>
              태그 <span className="text-[11.5px] font-normal text-[#8a8f83]">(최대 5개)</span>
            </span>
            <span
              className={`text-[11.5px] font-medium ${
                tags.length > 5
                  ? 'text-[#b04a2a]'
                  : tags.length === 5
                    ? 'text-[#3e5b34]'
                    : 'text-[#8a8f83]'
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

        {/* 상세 정보 그룹 카드 */}
        <div
          className={groupCardCls}
          style={{ boxShadow: '0 1px 0 rgba(47,58,46,.04), 0 1px 2px rgba(47,58,46,.05)' }}
        >
          <span className={groupLegendCls}>상세 정보</span>

          <fieldset disabled={readOnly} className="border-0 p-0 m-0 space-y-[18px]">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className={fieldCls.replace('mb-[18px]', '')}>
                <label htmlFor="f-year" className={labelCls}>창설년도</label>
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
              </div>
              <div className={fieldCls.replace('mb-[18px]', '')}>
                <label htmlFor="f-gen" className={labelCls}>현재 기수</label>
                <input
                  id="f-gen"
                  type="number"
                  min={1}
                  value={cohortNumber}
                  onChange={(event) => setCohortNumber(event.target.value)}
                  placeholder="예: 10"
                  className={inputCls}
                />
              </div>
            </div>

            <div className={fieldCls.replace('mb-[18px]', '')}>
              <label htmlFor="f-loc" className={labelCls}>위치</label>
              <input
                id="f-loc"
                type="text"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="예: 학생회관 405호"
                className={inputCls}
              />
            </div>

            <div className={fieldCls.replace('mb-[18px]', '')}>
              <label htmlFor="f-contact" className={labelCls}>연락처</label>
              <input
                id="f-contact"
                type="text"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="예: 010-0000-0000"
                className={inputCls}
              />
            </div>

            <div className={fieldCls.replace('mb-[18px]', '')}>
              <span className={labelCls}>활동 요일 / 빈도</span>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <ActiveDaysToggle value={activeDays} onChange={setActiveDays} disabled={readOnly} />
                <span className="w-px h-5 bg-[#d9d4c3] mx-1" />
                <span className="text-[13px] text-[#4a5247]">주</span>
                <input
                  type="number"
                  min={1}
                  value={activityFrequency}
                  onChange={(event) => setActivityFrequency(event.target.value)}
                  className="w-14 text-center border border-[#cfcab8] bg-white rounded-[8px] px-2 py-1.5 text-[13.5px] focus:outline-none focus:border-[#4a6b3f]"
                />
                <span className="text-[13px] text-[#4a5247]">회</span>
              </div>
            </div>

            <div className={fieldCls.replace('mb-[18px]', '')}>
              <label htmlFor="f-fee" className={labelCls}>회비</label>
              <input
                id="f-fee"
                type="text"
                value={membershipFee}
                onChange={(event) => setMembershipFee(event.target.value)}
                placeholder="예: 학기당 30,000원"
                className={inputCls}
              />
            </div>
          </fieldset>
        </div>

        {/* 소개 콘텐츠 그룹 카드 */}
        <div
          className={groupCardCls}
          style={{ boxShadow: '0 1px 0 rgba(47,58,46,.04), 0 1px 2px rgba(47,58,46,.05)' }}
        >
          <span className={groupLegendCls}>소개 콘텐츠</span>

          <fieldset disabled={readOnly} className="border-0 p-0 m-0 space-y-[18px]">
            <div className={fieldCls.replace('mb-[18px]', '')}>
              <label htmlFor="f-tag" className={labelCls}>한 줄 태그라인</label>
              <input
                id="f-tag"
                type="text"
                value={tagline}
                maxLength={60}
                onChange={(event) => setTagline(event.target.value)}
                placeholder="예: 코드를 두잉"
                className={inputCls}
              />
              <span className="text-[11.5px] text-[#b5b8ac]">{tagline.length}/60</span>
            </div>

            <div className={fieldCls.replace('mb-[18px]', '')}>
              <span className={labelCls}>이런 사람이 좋아할 거예요</span>
              <p className="text-[11.5px] text-[#8a8f83] -mt-0.5">최대 10개, 각 100자 이하.</p>
              <HighlightsRepeater value={highlights} onChange={setHighlights} readOnly={readOnly} />
            </div>

            <div className={fieldCls.replace('mb-[18px]', '')}>
              <label htmlFor="f-proj" className={labelCls}>주요 프로젝트</label>
              <textarea
                id="f-proj"
                value={majorProjects}
                onChange={(event) => setMajorProjects(event.target.value)}
                rows={5}
                placeholder="동아리에서 진행 중이거나 마친 프로젝트를 자유롭게 적어주세요."
                className={`${inputCls} resize-y leading-relaxed`}
              />
            </div>
          </fieldset>
        </div>

        {/* SNS 링크 */}
        <div className={fieldCls}>
          <span className={labelCls}>
            SNS 링크 <span className="text-[11.5px] font-normal text-[#8a8f83]">(최대 10개)</span>
          </span>
          <SnsLinksRepeater value={snsLinks} onChange={setSnsLinks} readOnly={readOnly} />
        </div>

        {/* FAQ */}
        <div className={fieldCls}>
          <span className={labelCls}>
            FAQ <span className="text-[11.5px] font-normal text-[#8a8f83]">(최대 20개)</span>
          </span>
          <FaqsRepeater value={faqs} onChange={setFaqs} readOnly={readOnly} />
        </div>

        {/* 에러 / 저장 상태 */}
        {error && <p className="mt-2 text-[13px] text-[#b35a3a]">{error}</p>}
        {savedAt && !error && (
          <p className="mt-2 text-[13px] text-[#3e5b34]">저장됨 ({savedAt.toLocaleTimeString()})</p>
        )}

        {/* 저장 버튼 */}
        {!readOnly && (
          <div className="mt-6">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {mutation.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        )}

      </div>
    </form>
  );
}
