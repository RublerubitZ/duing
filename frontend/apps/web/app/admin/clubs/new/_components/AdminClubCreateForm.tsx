'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@duing/api';
import { useCreateClubMutation } from '@duing/hooks';
import type { AdminUserSearchResult, ClubCategory, CreateClubPayload } from '@duing/types';
import { LeaderSearchCombobox } from '../../_components/LeaderSearchCombobox';
import { toRoute } from '../../../../_lib/route';

const CATEGORIES: ReadonlyArray<ClubCategory> = [
  'ACADEMIC',
  'CULTURE',
  'ART',
  'SPORTS',
  'VOLUNTEER',
  'RELIGION',
  'HOBBY',
  'OTHER',
];

const CATEGORY_LABEL: Record<ClubCategory, string> = {
  ACADEMIC: '학술',
  CULTURE: '문화',
  ART: '예술',
  SPORTS: '체육',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

export function AdminClubCreateForm() {
  const router = useRouter();
  const mutation = useCreateClubMutation();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ClubCategory>('ACADEMIC');
  const [division, setDivision] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [leader, setLeader] = useState<AdminUserSearchResult | null>(null);
  const [centralClub, setCentralClub] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);

  function validate(): string | null {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) return '동아리 이름은 필수 입력값입니다.';
    if (trimmedName.length > 100) return '동아리 이름은 100자 이하여야 합니다.';
    if (division.trim().length > 50) return '분류는 50자 이하여야 합니다.';
    if (logoUrl.trim().length > 500) return '로고 URL은 500자 이하여야 합니다.';
    if (!leader) return '동아리장(회장) 을 검색해 선택해주세요.';
    return null;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    // 위에서 leader null 가드를 통과했으므로 여기서는 non-null 단언 없이 narrowing 된 상태.
    if (!leader) return;

    const payload: CreateClubPayload = {
      name: name.trim(),
      category,
      division: division.trim() || undefined,
      description: description.trim() || undefined,
      logoUrl: logoUrl.trim() || undefined,
      leaderId: leader.id,
      centralClub,
    };

    mutation.mutate(payload, {
      onSuccess: () => {
        router.push(toRoute('/admin/clubs'));
      },
      onError: (mutationError) => {
        const message =
          mutationError instanceof ApiError
            ? mutationError.message
            : '등록에 실패했습니다.';
        setFormError(message);
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-line bg-white p-6">
      <Field label="동아리 이름" required>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          placeholder="예: 두잉 코딩 동아리"
          className="border-line bg-paper w-full rounded-md border px-3 py-2 text-sm"
        />
      </Field>

      <Field label="카테고리" required>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as ClubCategory)}
          className="border-line bg-paper w-full rounded-md border px-3 py-2 text-sm"
        >
          {CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {CATEGORY_LABEL[option]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="분류 (학생회 / 분과 등)">
        <input
          type="text"
          value={division}
          onChange={(event) => setDivision(event.target.value)}
          maxLength={50}
          placeholder="예: 컴퓨터정보공학부"
          className="border-line bg-paper w-full rounded-md border px-3 py-2 text-sm"
        />
      </Field>

      <Field label="중앙동아리 여부">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={centralClub}
            onChange={(event) => setCentralClub(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          중앙동아리로 지정 (공개 화면에 🏛️ 배지 노출)
        </label>
      </Field>

      <Field label="설명">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          placeholder="동아리 소개 (선택)"
          className="border-line bg-paper w-full rounded-md border px-3 py-2 text-sm"
        />
      </Field>

      <Field label="로고 URL">
        <input
          type="url"
          value={logoUrl}
          onChange={(event) => setLogoUrl(event.target.value)}
          maxLength={500}
          placeholder="https://..."
          className="border-line bg-paper w-full rounded-md border px-3 py-2 text-sm"
        />
      </Field>

      <Field label="동아리장 (회장)" required>
        <LeaderSearchCombobox selectedLeader={leader} onSelect={setLeader} />
        <p className="text-charcoal-3 mt-1 text-xs">
          학번/이름/이메일로 검색해 선택하세요. 등록 즉시 해당 사용자가 LEADER 로 자동 등록됩니다.
        </p>
      </Field>

      {formError && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Link
          href={toRoute('/admin/clubs')}
          className="text-charcoal-2 rounded-md px-3 py-2 text-sm hover:bg-slate-100"
        >
          취소
        </Link>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="btn btn-primary rounded-md px-4 text-[13px] disabled:opacity-50"
        >
          {mutation.isPending ? '등록 중…' : '등록'}
        </button>
      </div>
    </form>
  );
}

type FieldProps = {
  label: string;
  required?: boolean;
  children: React.ReactNode;
};

function Field({ label, required, children }: FieldProps) {
  return (
    <label className="block">
      <span className="text-charcoal-2 mb-1.5 block text-[13px] font-semibold">
        {label}
        {required && <span className="text-coral ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}
