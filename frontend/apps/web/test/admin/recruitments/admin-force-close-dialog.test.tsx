import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminJoinLinkStatus, AdminRecruitmentDetail } from '@duing/types';

import { AdminForceCloseDialog } from '@/app/admin/recruitments/_components/AdminForceCloseDialog';

function makeJoinLink(overrides: Partial<AdminJoinLinkStatus> = {}): AdminJoinLinkStatus {
  return {
    linkStatus: 'ACTIVE',
    generation: 12,
    maxUses: 40,
    usedCount: 12,
    totalRequestCount: 12,
    pendingCount: 3,
    enrolledCount: 9,
    joinWindowDays: 14,
    joinExpiresAt: null,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<AdminRecruitmentDetail> = {}): AdminRecruitmentDetail {
  return {
    recruitmentId: 5,
    clubId: 10,
    clubName: '두잉코드',
    title: '2026 신입 부원 모집',
    applicationMode: 'SELF',
    status: 'OPEN',
    displayStatus: 'OPEN',
    closedAt: null,
    applicantCount: 12,
    startDate: '2026-03-02',
    endDate: '2026-03-20',
    updatedAt: '2026-08-01T02:30:00Z',
    externalFormUrl: null,
    joinLink: null,
    ...overrides,
  };
}

const props = {
  recruitment: makeDetail(),
  isPending: false,
  errorMessage: null,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
} satisfies React.ComponentProps<typeof AdminForceCloseDialog>;

describe('모집 강제 마감 다이얼로그', () => {
  it('자체 지원 모집에는 신규 지원이 막힌다는 영향을 안내한다', () => {
    render(<AdminForceCloseDialog {...props} />);

    expect(
      screen.getByText(
        '마감하면 신규 지원이 중단되고 평가·면접 진행도 멈춥니다. 아직 결과가 정해지지 않은 지원서는 마감 후에도 합격·불합격 확정만 할 수 있습니다.',
      ),
    ).toBeInTheDocument();
  });

  // 진행 중 모집은 지금 마감하는 시각부터 센다 — "모집 종료 후"는 위의 모집 기간(종료일)부터로 읽힐 수 있다.
  it('외부 폼 모집에는 가입 링크가 마감 후 며칠까지 살아 있는지 알린다', () => {
    render(
      <AdminForceCloseDialog
        {...props}
        recruitment={makeDetail({
          applicationMode: 'EXTERNAL',
          applicantCount: null,
          externalFormUrl: 'https://forms.gle/abc123',
          joinLink: makeJoinLink({ joinWindowDays: 14 }),
        })}
      />,
    );

    expect(
      screen.getByText(
        '새 가입 링크는 발급할 수 없습니다. 기존 가입 링크는 마감 후 14일까지만 사용할 수 있습니다.',
      ),
    ).toBeInTheDocument();
  });

  it("진행 중 모집의 '모집 종료일까지' 가입 링크는 마감하면 바로 만료된다고 알린다 — '모집 종료 후 0일'로 쓰지 않는다", () => {
    render(
      <AdminForceCloseDialog
        {...props}
        recruitment={makeDetail({
          applicationMode: 'EXTERNAL',
          applicantCount: null,
          externalFormUrl: 'https://forms.gle/abc123',
          joinLink: makeJoinLink({ joinWindowDays: 0 }),
        })}
      />,
    );

    expect(
      screen.getByText(
        "새 가입 링크는 발급할 수 없습니다. 기존 가입 링크는 가입 가능 기간이 '모집 종료일까지'라 마감하면 바로 만료됩니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/모집 종료 후 0일/)).toBeNull();
  });

  // 종료일(3/20)이 지난 모집(만료-OPEN)은 링크 기한이 종료일 다음 날 0시 기준으로 이미 정해져 있어 마감해도 바뀌지 않는다 —
  // 서버가 준 기한(joinExpiresAt)을 그대로 쓰고, "마감하면 바로 만료"나 "모집 종료 후 N일"로 다시 세지 않는다.
  describe('종료일이 지난 모집(3/24 에 강제 마감)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-03-24T03:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("'모집 종료일까지' 링크(3/21 0시 만료)는 이미 만료됐다고 알린다", () => {
      render(
        <AdminForceCloseDialog
          {...props}
          recruitment={makeDetail({
            applicationMode: 'EXTERNAL',
            displayStatus: 'CLOSED',
            applicantCount: null,
            externalFormUrl: 'https://forms.gle/abc123',
            joinLink: makeJoinLink({
              linkStatus: 'EXPIRED',
              joinWindowDays: 0,
              joinExpiresAt: '2026-03-20T15:00:00Z',
            }),
          })}
        />,
      );

      expect(
        screen.getByText('새 가입 링크는 발급할 수 없습니다. 기존 가입 링크는 이미 만료됐습니다.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/바로 만료/)).toBeNull();
    });

    it('7일 링크는 서버가 준 만료 일시(3/28 0시, KST)까지만 쓸 수 있다고 알린다', () => {
      render(
        <AdminForceCloseDialog
          {...props}
          recruitment={makeDetail({
            applicationMode: 'EXTERNAL',
            displayStatus: 'CLOSED',
            applicantCount: null,
            externalFormUrl: 'https://forms.gle/abc123',
            joinLink: makeJoinLink({ joinWindowDays: 7, joinExpiresAt: '2026-03-27T15:00:00Z' }),
          })}
        />,
      );

      expect(
        screen.getByText(
          '새 가입 링크는 발급할 수 없습니다. 기존 가입 링크는 2026.03.28 00:00까지만 사용할 수 있습니다.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/마감 후 7일|모집 종료 후 7일/)).toBeNull();
    });

    // 기기 시계가 늦어도 서버가 이미 만료로 판정했으면 만료로 쓴다.
    it('서버가 만료로 준 링크는 기기 시각상 기한 전이어도 이미 만료됐다고 알린다', () => {
      render(
        <AdminForceCloseDialog
          {...props}
          recruitment={makeDetail({
            applicationMode: 'EXTERNAL',
            displayStatus: 'CLOSED',
            applicantCount: null,
            externalFormUrl: 'https://forms.gle/abc123',
            joinLink: makeJoinLink({
              linkStatus: 'EXPIRED',
              joinWindowDays: 7,
              joinExpiresAt: '2026-03-27T15:00:00Z',
            }),
          })}
        />,
      );

      expect(
        screen.getByText('새 가입 링크는 발급할 수 없습니다. 기존 가입 링크는 이미 만료됐습니다.'),
      ).toBeInTheDocument();
    });
  });

  it('활성 가입 링크가 없으면 사용 기한 문장은 붙이지 않는다 — 기한을 지어내지 않는다', () => {
    render(
      <AdminForceCloseDialog
        {...props}
        recruitment={makeDetail({
          applicationMode: 'EXTERNAL',
          applicantCount: null,
          externalFormUrl: 'https://forms.gle/abc123',
          joinLink: null,
        })}
      />,
    );

    expect(screen.getByText('새 가입 링크는 발급할 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText(/기존 가입 링크는/)).toBeNull();
  });

  it('사유는 선택이라 비워도 마감할 수 있고, 이때 사유는 보내지 않는다', () => {
    const onConfirm = vi.fn();
    render(<AdminForceCloseDialog {...props} onConfirm={onConfirm} />);

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '강제 마감' }));

    expect(onConfirm).toHaveBeenCalledWith({ reason: undefined });
  });

  it('공백만 입력한 사유도 보내지 않는다', () => {
    const onConfirm = vi.fn();
    render(<AdminForceCloseDialog {...props} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText('마감 사유 (선택)'), { target: { value: '   ' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '강제 마감' }));

    expect(onConfirm).toHaveBeenCalledWith({ reason: undefined });
  });

  it('입력한 사유는 앞뒤 공백을 털어 함께 보낸다', () => {
    const onConfirm = vi.fn();
    render(<AdminForceCloseDialog {...props} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText('마감 사유 (선택)'), {
      target: { value: ' 기간 경과 방치 ' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '강제 마감' }));

    expect(onConfirm).toHaveBeenCalledWith({ reason: '기간 경과 방치' });
  });

  it('사유 글자 수를 세어 보여주고 상한에서 끊는다 — 서버 400 을 받아보게 두지 않는다', () => {
    render(<AdminForceCloseDialog {...props} />);

    const reasonInput = screen.getByLabelText('마감 사유 (선택)');
    expect(screen.getByText('0/500')).toBeInTheDocument();

    // 드래그-드롭 삽입·자동입력은 maxLength 를 통과하므로 값 자체를 잘라 상한을 지킨다.
    fireEvent.change(reasonInput, { target: { value: '가'.repeat(501) } });

    expect(reasonInput).toHaveValue('가'.repeat(500));
    expect(screen.getByText('500/500')).toBeInTheDocument();
  });

  it('마감에 실패하면 호출자가 준 사유를 다이얼로그 안에서 보여준다', () => {
    render(<AdminForceCloseDialog {...props} errorMessage="이미 마감된 모집입니다." />);

    expect(screen.getByText('이미 마감된 모집입니다.')).toBeInTheDocument();
  });

  it('처리 중에는 버튼을 잠근다 — 두 번 눌러 중복 요청이 나가지 않게 한다', () => {
    render(<AdminForceCloseDialog {...props} isPending />);

    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: /강제 마감/ }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
  });
});
