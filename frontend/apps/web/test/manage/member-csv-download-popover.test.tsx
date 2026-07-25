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
  { memberId: 1, name: '홍길동', studentId: '20240001', major: '컴퓨터정보공학부', phone: null, role: 'LEADER', joinedAt: '2026-03-01T09:00:00', generation: 12, feeStatus: 'PAID' },
  { memberId: 2, name: '김철수', studentId: '20240002', major: '경영학과', phone: null, role: 'MEMBER', joinedAt: '2026-03-02T09:00:00', generation: 11, feeStatus: 'UNPAID' },
];

const allIds = new Set([1, 2]);

describe('MemberCsvDownloadPopover', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    downloadTextFile.mockReset();
    mutateAsync.mockResolvedValue(rows);
  });

  it('팝오버에 현재 필터 기준 인원 수를 안내한다', async () => {
    const user = userEvent.setup();
    render(
      <MemberCsvDownloadPopover clubId={1} clubName="AI동아리" memberIds={new Set([1])} useGeneration={false} />,
    );

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));

    expect(await screen.findByText('현재 필터 기준 1명')).toBeInTheDocument();
  });

  it('다운로드 클릭 시 includePhone=false 로 export 후 CSV 파일을 내려받는다', async () => {
    const user = userEvent.setup();
    render(
      <MemberCsvDownloadPopover clubId={1} clubName="AI동아리" memberIds={allIds} useGeneration={false} />,
    );

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));
    await user.click(await screen.findByRole('button', { name: '다운로드' }));

    expect(mutateAsync).toHaveBeenCalledWith({ includePhone: false, memberIds: [1, 2] });
    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const firstCall = downloadTextFile.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [filename, content] = firstCall ?? [];
    expect(filename).toContain('AI동아리_멤버목록_');
    expect(filename).toMatch(/\.csv$/);
    expect(content).toContain('이름,학번,학과,역할,회비,가입일');
  });

  it('현재 필터 결과의 memberId 를 서버에 넘겨 그 범위만 받아 내보낸다', async () => {
    // 서버가 memberIds 범위로 걸러 응답하는 동작을 흉내낸다 — 화면 밖 회원은 애초에 내려오지 않는다.
    mutateAsync.mockImplementation(({ memberIds }: { memberIds?: number[] }) =>
      Promise.resolve(rows.filter((row) => memberIds?.includes(row.memberId) ?? true)),
    );
    const user = userEvent.setup();
    render(
      <MemberCsvDownloadPopover clubId={1} clubName="AI동아리" memberIds={new Set([1])} useGeneration={false} />,
    );

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));
    await user.click(await screen.findByRole('button', { name: '다운로드' }));

    expect(mutateAsync).toHaveBeenCalledWith({ includePhone: false, memberIds: [1] });
    const [, content] = downloadTextFile.mock.calls[0] ?? [];
    expect(content).toContain('홍길동');
    expect(content).not.toContain('김철수');
  });

  it('useGeneration=true 면 기수 컬럼을 포함해 내보낸다', async () => {
    const user = userEvent.setup();
    render(
      <MemberCsvDownloadPopover clubId={1} clubName="AI동아리" memberIds={allIds} useGeneration />,
    );

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));
    await user.click(await screen.findByRole('button', { name: '다운로드' }));

    const [, content] = downloadTextFile.mock.calls[0] ?? [];
    expect(content).toContain('이름,학번,학과,역할,기수,회비,가입일');
  });

  it('전화번호 포함 체크 후 다운로드하면 includePhone=true 로 export 한다', async () => {
    const user = userEvent.setup();
    render(
      <MemberCsvDownloadPopover clubId={1} clubName="AI동아리" memberIds={allIds} useGeneration={false} />,
    );

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: '다운로드' }));

    expect(mutateAsync).toHaveBeenCalledWith({ includePhone: true, memberIds: [1, 2] });
    const firstCall = downloadTextFile.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [, content] = firstCall ?? [];
    expect(content).toContain('이름,학번,학과,휴대전화,역할,회비,가입일');
  });

  it('필터 결과가 0명이면 다운로드 버튼이 비활성된다', async () => {
    const user = userEvent.setup();
    render(
      <MemberCsvDownloadPopover clubId={1} clubName="AI동아리" memberIds={new Set()} useGeneration={false} />,
    );

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));

    expect(await screen.findByRole('button', { name: '다운로드' })).toBeDisabled();
  });

  it('export 실패 시 오류 메시지를 표시하고 팝오버를 닫지 않는다', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('서버 오류'));
    const user = userEvent.setup();
    render(
      <MemberCsvDownloadPopover clubId={1} clubName="AI동아리" memberIds={allIds} useGeneration={false} />,
    );

    await user.click(screen.getByRole('button', { name: '멤버 명단 다운로드' }));
    await user.click(await screen.findByRole('button', { name: '다운로드' }));

    expect(await screen.findByText('서버 오류')).toBeInTheDocument();
    expect(downloadTextFile).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '다운로드' })).toBeInTheDocument();
  });
});
