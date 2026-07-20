import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ClubMemberExportRow } from '@duing/types';

const mutateAsync = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useClubMembersExportMutation: () => ({ mutateAsync, isPending: false }),
}));

const downloadTextFile = vi.fn();
vi.mock('@/app/_lib/downloadFile', () => ({
  downloadTextFile: (...args: unknown[]) => downloadTextFile(...args),
}));

import { MemberCsvDownloadPopover } from '../../app/manage/clubs/[clubId]/members/_components/MemberCsvDownloadPopover';

const rows: ClubMemberExportRow[] = [
  { memberId: 1, name: '홍길동', studentId: '20240001', major: '컴퓨터정보공학부', phone: null, role: 'LEADER', joinedAt: '2026-03-01T09:00:00' },
];

describe('MemberCsvDownloadPopover', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    downloadTextFile.mockReset();
    mutateAsync.mockResolvedValue(rows);
  });

  it('다운로드 클릭 시 includePhone=false 로 export 후 CSV 파일을 내려받는다', async () => {
    const user = userEvent.setup();
    render(<MemberCsvDownloadPopover clubId={1} clubName="AI동아리" />);

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));
    await user.click(await screen.findByRole('button', { name: '다운로드' }));

    expect(mutateAsync).toHaveBeenCalledWith(false);
    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const firstCall = downloadTextFile.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [filename, content] = firstCall ?? [];
    expect(filename).toContain('AI동아리_멤버목록_');
    expect(filename).toMatch(/\.csv$/);
    expect(content).toContain('이름,학번,학과,역할,가입일');
  });

  it('전화번호 포함 체크 후 다운로드하면 includePhone=true 로 export 한다', async () => {
    const user = userEvent.setup();
    render(<MemberCsvDownloadPopover clubId={1} clubName="AI동아리" />);

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: '다운로드' }));

    expect(mutateAsync).toHaveBeenCalledWith(true);
    const firstCall = downloadTextFile.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [, content] = firstCall ?? [];
    expect(content).toContain('이름,학번,학과,휴대전화,역할,가입일');
  });

  it('export 실패 시 오류 메시지를 표시하고 팝오버를 닫지 않는다', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('서버 오류'));
    const user = userEvent.setup();
    render(<MemberCsvDownloadPopover clubId={1} clubName="AI동아리" />);

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));
    await user.click(await screen.findByRole('button', { name: '다운로드' }));

    expect(await screen.findByText('서버 오류')).toBeInTheDocument();
    expect(downloadTextFile).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '다운로드' })).toBeInTheDocument();
  });
});
