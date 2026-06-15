'use client';

import { useState } from 'react';
import { useClubMembersExportMutation } from '@duing/hooks';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { downloadTextFile } from '@/app/_lib/downloadFile';
import { buildMembersCsv, buildMembersCsvFilename } from '../_lib/membersCsv';

type MemberCsvDownloadPopoverProps = {
  clubId: number;
  clubName: string;
};

export function MemberCsvDownloadPopover({ clubId, clubName }: MemberCsvDownloadPopoverProps) {
  const [open, setOpen] = useState(false);
  const [includePhone, setIncludePhone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportMembers = useClubMembersExportMutation(clubId);

  async function handleDownload() {
    setError(null);
    try {
      const rows = await exportMembers.mutateAsync(includePhone);
      const csv = buildMembersCsv(rows, includePhone);
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
          disabled={exportMembers.isPending}
          className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {exportMembers.isPending ? '내보내는 중…' : '다운로드'}
        </button>
      </PopoverContent>
    </Popover>
  );
}
