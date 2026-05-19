'use client';

import { useState } from 'react';
import type { ClubDetail, ClubDayOfWeek, UpdateClubPayload } from '@duing/types';
import { updateClubSchema } from '@duing/schemas';
import { useUpdateClubMutation } from '@duing/hooks';
import { TagsInput } from './TagsInput';
import { SnsLinksRepeater } from './SnsLinksRepeater';
import { FaqsRepeater } from './FaqsRepeater';
import { HighlightsRepeater } from './HighlightsRepeater';
import { ActiveDaysToggle } from './ActiveDaysToggle';

type ClubInfoFormProps = {
  clubId: number;
  detail: ClubDetail;
  readOnly: boolean;
};

const CATEGORIES = ['ACADEMIC', 'CULTURE', 'ART', 'SPORTS', 'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER'] as const;
type CategoryLiteral = (typeof CATEGORIES)[number];

function isCategory(value: string): value is CategoryLiteral {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function ClubInfoForm({ clubId, detail, readOnly }: ClubInfoFormProps) {
  const [name, setName] = useState(detail.name);
  const [category, setCategory] = useState(detail.category);
  const [division, setDivision] = useState(detail.division ?? '');
  const [description, setDescription] = useState(detail.description ?? '');
  const [logoUrl, setLogoUrl] = useState(detail.logoUrl ?? '');
  const [coverUrl, setCoverUrl] = useState(detail.coverUrl ?? '');
  const [tags, setTags] = useState(detail.tags);
  const [snsLinks, setSnsLinks] = useState(detail.snsLinks);
  const [faqs, setFaqs] = useState(detail.faqs);
  const [foundedYear, setFoundedYear] = useState<string>(
    detail.foundedYear !== null ? String(detail.foundedYear) : ''
  );
  const [cohortNumber, setCohortNumber] = useState<string>(
    detail.cohortNumber !== null ? String(detail.cohortNumber) : ''
  );
  const [location, setLocation] = useState(detail.location ?? '');
  const [contactEmail, setContactEmail] = useState(detail.contactEmail ?? '');
  const [activityFrequency, setActivityFrequency] = useState<string>(
    detail.activityFrequency !== null ? String(detail.activityFrequency) : ''
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
    if (description !== (detail.description ?? '')) payload.description = description || null;
    if (logoUrl !== (detail.logoUrl ?? '')) payload.logoUrl = logoUrl || null;
    if (coverUrl !== (detail.coverUrl ?? '')) payload.coverUrl = coverUrl || null;
    if (JSON.stringify(tags) !== JSON.stringify(detail.tags)) payload.tags = tags;
    if (JSON.stringify(snsLinks) !== JSON.stringify(detail.snsLinks)) payload.snsLinks = snsLinks;
    if (JSON.stringify(faqs) !== JSON.stringify(detail.faqs)) payload.faqs = faqs;
    const newFoundedYear = foundedYear.trim() === '' ? null : Number(foundedYear);
    if (newFoundedYear !== detail.foundedYear) {
      payload.foundedYear = newFoundedYear;
    }
    const newCohortNumber = cohortNumber.trim() === '' ? null : Number(cohortNumber);
    if (newCohortNumber !== detail.cohortNumber) {
      payload.cohortNumber = newCohortNumber;
    }
    if (location !== (detail.location ?? '')) {
      payload.location = location || null;
    }
    if (contactEmail !== (detail.contactEmail ?? '')) {
      payload.contactEmail = contactEmail || null;
    }
    const newActivityFrequency = activityFrequency.trim() === '' ? null : Number(activityFrequency);
    if (newActivityFrequency !== detail.activityFrequency) {
      payload.activityFrequency = newActivityFrequency;
    }
    if (JSON.stringify(activeDays) !== JSON.stringify(detail.activeDays)) {
      payload.activeDays = activeDays;
    }
    if (membershipFee !== (detail.membershipFee ?? '')) {
      payload.membershipFee = membershipFee || null;
    }
    if (tagline !== (detail.tagline ?? '')) {
      payload.tagline = tagline || null;
    }
    if (JSON.stringify(highlights) !== JSON.stringify(detail.highlights)) {
      payload.highlights = highlights;
    }
    if (majorProjects !== (detail.majorProjects ?? '')) {
      payload.majorProjects = majorProjects || null;
    }
    return payload;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const fullData = {
      name, category,
      division: division || null,
      description: description || null,
      logoUrl: logoUrl || null,
      coverUrl: coverUrl || null,
      tags, snsLinks, faqs,
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
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">동아리 정보</h1>
        {readOnly && (
          <span className="text-xs text-slate-500">
            OFFICER 는 읽기만 가능합니다. 수정은 LEADER 만 할 수 있습니다.
          </span>
        )}
      </header>

      <fieldset disabled={readOnly} className="space-y-4">
        <label className="block">
          <span className="text-sm text-slate-600">이름</span>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">카테고리</span>
          <select
            value={category}
            onChange={(e) => {
              const next = e.target.value;
              if (isCategory(next)) setCategory(next);
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">분류</span>
          <input
            type="text" value={division} onChange={(e) => setDivision(e.target.value)}
            placeholder="예: 중앙동아리"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">소개</span>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">로고 URL</span>
          <input
            type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">커버 URL</span>
          <input
            type="url" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <div>
          <p className="mb-1 text-sm text-slate-600">태그 (최대 20개)</p>
          <TagsInput value={tags} onChange={setTags} readOnly={readOnly} />
        </div>

        <fieldset disabled={readOnly} className="space-y-4 rounded-lg border border-slate-200 p-4">
          <legend className="px-2 text-sm font-medium text-slate-700">상세 정보</legend>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm text-slate-600">창설년도</span>
              <input
                type="number"
                min={1900}
                max={2100}
                value={foundedYear}
                onChange={(event) => setFoundedYear(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="예: 2018"
              />
            </label>
            <label className="block">
              <span className="block text-sm text-slate-600">현재 기수</span>
              <input
                type="number"
                min={1}
                value={cohortNumber}
                onChange={(event) => setCohortNumber(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="예: 10"
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-sm text-slate-600">위치</span>
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="예: 학생회관 405호"
            />
          </label>

          <label className="block">
            <span className="block text-sm text-slate-600">컨택 이메일</span>
            <input
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="예: club@daegu.ac.kr"
            />
          </label>

          <div>
            <span className="block text-sm text-slate-600">활동 요일 / 빈도</span>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <ActiveDaysToggle value={activeDays} onChange={setActiveDays} disabled={readOnly} />
              <label className="flex items-center gap-2 text-sm">
                주
                <input
                  type="number"
                  min={1}
                  value={activityFrequency}
                  onChange={(event) => setActivityFrequency(event.target.value)}
                  className="w-16 rounded-md border border-slate-300 px-2 py-1"
                />
                회
              </label>
            </div>
          </div>

          <label className="block">
            <span className="block text-sm text-slate-600">회비</span>
            <input
              type="text"
              value={membershipFee}
              onChange={(event) => setMembershipFee(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="예: 학기당 30,000원"
            />
          </label>
        </fieldset>

        <fieldset disabled={readOnly} className="space-y-4 rounded-lg border border-slate-200 p-4">
          <legend className="px-2 text-sm font-medium text-slate-700">소개 콘텐츠</legend>

          <label className="block">
            <span className="block text-sm text-slate-600">한 줄 태그라인</span>
            <input
              type="text"
              value={tagline}
              maxLength={60}
              onChange={(event) => setTagline(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="예: 코드를 두잉"
            />
            <span className="mt-1 block text-xs text-slate-400">{tagline.length}/60</span>
          </label>

          <div>
            <span className="block text-sm text-slate-600">이런 사람이 좋아할 거예요</span>
            <p className="mb-2 text-xs text-slate-400">최대 10개, 각 100자 이하.</p>
            <HighlightsRepeater
              value={highlights}
              onChange={setHighlights}
              readOnly={readOnly}
            />
          </div>

          <label className="block">
            <span className="block text-sm text-slate-600">주요 프로젝트</span>
            <textarea
              value={majorProjects}
              onChange={(event) => setMajorProjects(event.target.value)}
              rows={5}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="동아리에서 진행 중이거나 마친 프로젝트를 자유롭게 적어주세요."
            />
          </label>
        </fieldset>

        <div>
          <p className="mb-1 text-sm text-slate-600">SNS 링크 (최대 10개)</p>
          <SnsLinksRepeater value={snsLinks} onChange={setSnsLinks} readOnly={readOnly} />
        </div>

        <div>
          <p className="mb-1 text-sm text-slate-600">FAQ (최대 20개)</p>
          <FaqsRepeater value={faqs} onChange={setFaqs} readOnly={readOnly} />
        </div>
      </fieldset>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {savedAt && !error && (
        <p className="text-sm text-emerald-600">저장됨 ({savedAt.toLocaleTimeString()})</p>
      )}

      {!readOnly && (
        <button
          type="submit" disabled={mutation.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {mutation.isPending ? '저장 중…' : '저장'}
        </button>
      )}
    </form>
  );
}
