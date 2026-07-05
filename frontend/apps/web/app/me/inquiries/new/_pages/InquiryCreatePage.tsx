'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ApiError } from '@duing/api';
import { useCreateFederationInquiryMutation } from '@duing/hooks';

import { toRoute } from '@/app/_lib/route';
import { useToast } from '@/app/_components/toast/ToastProvider';

const TITLE_MAX_LENGTH = 120;
const CONTENT_MAX_LENGTH = 2000;

export function InquiryCreatePage() {
  const router = useRouter();
  const { addToast } = useToast();
  const createMutation = useCreateFederationInquiryMutation();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const inquiryId = await createMutation.mutateAsync({
        title: title.trim(),
        content: content.trim(),
      });
      addToast('문의가 등록되었어요');
      router.push(toRoute(`/me/inquiries/${inquiryId}`));
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message || '문의 등록에 실패했습니다.');
        return;
      }
      setError(submitError instanceof Error ? submitError.message : '문의 등록에 실패했습니다.');
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={toRoute('/me/inquiries')} className="text-sm text-charcoal-2 hover:text-ink">
        ← 내 문의
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-bold text-ink">문의 작성</h1>
        <p className="mt-1 text-sm text-charcoal-3">
          총동아리연합회에 궁금한 점을 남겨주세요. 답변은 마이페이지의 내 문의에서 확인할 수 있습니다.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-charcoal-2">제목</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={TITLE_MAX_LENGTH}
            required
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-charcoal-2">내용</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={CONTENT_MAX_LENGTH}
            required
            rows={10}
            className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-[10px] bg-coral/5 px-4 py-3 text-sm text-coral">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="btn btn-primary px-7 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createMutation.isPending ? '등록 중…' : '등록'}
          </button>
        </div>
      </form>
    </main>
  );
}
