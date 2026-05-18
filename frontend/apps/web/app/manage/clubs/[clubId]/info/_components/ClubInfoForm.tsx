'use client';

import { useState } from 'react';
import type { ClubDetail, UpdateClubPayload } from '@duing/types';
import { updateClubSchema } from '@duing/schemas';
import { useUpdateClubMutation } from '@duing/hooks';
import { TagsInput } from './TagsInput';
import { SnsLinksRepeater } from './SnsLinksRepeater';
import { FaqsRepeater } from './FaqsRepeater';

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
    return payload;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const fullData = { name, category, division: division || null, description: description || null,
                       logoUrl: logoUrl || null, coverUrl: coverUrl || null, tags, snsLinks, faqs };
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
