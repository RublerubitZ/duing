'use client';

import { useState } from 'react';
import { useClubMembersExportMutation } from '@duing/hooks';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { downloadTextFile } from '@/app/_lib/downloadFile';
import { buildMembersCsv, buildMembersCsvFilename } from '../_lib/membersCsv';

type MemberCsvDownloadPopoverProps = {
  clubId: number;
  clubName: string;
  // 현재 화면의 검색·필터 결과 memberId 집합. 이 범위를 서버에 넘겨 그만큼만 받는다
  // — 화면에 없는 회원의 전화번호가 브라우저로 오지 않고, 서버 감사 기록도 실제 내보낸 인원으로 남는다.
  memberIds: ReadonlySet<number>;
  useGeneration: boolean;
};

export function MemberCsvDownloadPopover({
  clubId,
  clubName,
  memberIds,
  useGeneration,
}: MemberCsvDownloadPopoverProps) {
  const [open, setOpen] = useState(false);
  const [includePhone, setIncludePhone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportMembers = useClubMembersExportMutation(clubId);

  async function handleDownload() {
    setError(null);
    try {
      const rows = await exportMembers.mutateAsync({
        includePhone,
        memberIds: [...memberIds],
      });
      const csv = buildMembersCsv(rows, includePhone, useGeneration);
      downloadTextFile(buildMembersCsvFilename(clubName, new Date()), csv);
      setOpen(false);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '다운로드 실패');
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-charcoal-2 hover:border-ink hover:text-ink"
        >
          멤버 명단 다운로드
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-4">
        <p className="text-xs font-medium text-charcoal-2">현재 필터 기준 {memberIds.size}명</p>

        <label className="flex items-start gap-2 text-sm text-charcoal">
          <input
            type="checkbox"
            checked={includePhone}
            onChange={(event) => setIncludePhone(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            전화번호 포함
            <span className="mt-0.5 block text-xs text-slate-400">
              전화번호를 포함하면 개인정보가 포함됩니다.
            </span>
          </span>
        </label>

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <button
          type="button"
          onClick={handleDownload}
          disabled={exportMembers.isPending || memberIds.size === 0}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {/* 장시간 작업(CSV 내보내기) — 스피너 + 안내 문구 유지 */}
          {exportMembers.isPending && <ButtonSpinner />}
          {exportMembers.isPending ? '내보내는 중…' : '다운로드'}
        </button>
      </PopoverContent>
    </Popover>
  );
}
