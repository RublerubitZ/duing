import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../app/_components/ImageUploader', () => ({
  ImageUploader: (props: { value: string; onChange: (url: string) => void }) => (
    <input
      data-testid="banner-uploader"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));

vi.mock('../../../app/admin/promotions/_components/ClubSelector', () => ({
  ClubSelector: (props: {
    selectedClubId: number | null;
    selectedClubName: string | null;
    onSelect: (id: number, name: string) => void;
    onClear: () => void;
  }) => (
    <div data-testid="club-selector">
      <button type="button" onClick={() => props.onSelect(99, '테스트 동아리')}>동아리 선택</button>
      {props.selectedClubId !== null && (
        <span data-testid="club-selected">{props.selectedClubName ?? props.selectedClubId}</span>
      )}
    </div>
  ),
}));

vi.mock('../../../app/admin/promotions/_components/NoticeSelector', () => ({
  NoticeSelector: (props: {
    selectedNoticeId: number | null;
    selectedNoticeTitle: string | null;
    onSelect: (id: number, title: string) => void;
    onClear: () => void;
  }) => (
    <div data-testid="notice-selector">
      <button type="button" onClick={() => props.onSelect(42, '테스트 공지')}>공지 선택</button>
      {props.selectedNoticeId !== null && (
        <span data-testid="notice-selected">{props.selectedNoticeTitle ?? props.selectedNoticeId}</span>
      )}
    </div>
  ),
}));

import { AdminPromotionForm } from '../../../app/admin/promotions/_components/AdminPromotionForm';

function renderCreateForm() {
  return render(
    <AdminPromotionForm
      mode="create"
      isSubmitting={false}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

describe('AdminPromotionForm — renderMode UI', () => {
  it('초기 렌더는 SYSTEM_COMPOSED 라디오가 선택돼 있다', () => {
    renderCreateForm();
    const systemRadio = screen.getByRole('radio', { name: /시스템 조합형/ });
    expect(systemRadio).toBeChecked();
    expect(screen.getByRole('radio', { name: /완성 이미지형/ })).not.toBeChecked();
  });

  it('FULL_BLEED 라디오를 선택하면 이미지/Alt Text 가드가 노출된다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    expect(
      screen.getByText(/배너 이미지 업로드가 필요합니다/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Alt Text 입력이 필요합니다/),
    ).toBeInTheDocument();
  });

  it('FULL_BLEED + 이미지 입력 시 이미지 가드는 사라지지만 Alt 가드는 남는다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    fireEvent.change(screen.getByTestId('banner-uploader'), {
      target: { value: 'https://example.com/poster.png' },
    });
    expect(
      screen.queryByText(/배너 이미지 업로드가 필요합니다/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Alt Text 입력이 필요합니다/),
    ).toBeInTheDocument();
  });

  it('FULL_BLEED + 이미지 + Alt 모두 입력 시 가드가 모두 사라진다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    fireEvent.change(screen.getByTestId('banner-uploader'), {
      target: { value: 'https://example.com/poster.png' },
    });
    fireEvent.change(screen.getByPlaceholderText(/2026 AI 학과 해커톤/), {
      target: { value: '2026 해커톤 포스터' },
    });
    expect(
      screen.queryByText(/배너 이미지 업로드가 필요합니다/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Alt Text 입력이 필요합니다/),
    ).not.toBeInTheDocument();
  });

  it('SYSTEM_COMPOSED 모드에서는 어떤 입력 상태라도 FULL_BLEED 전용 가드는 노출되지 않는다', () => {
    renderCreateForm();
    expect(
      screen.queryByText(/배너 이미지 업로드가 필요합니다/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Alt Text 입력이 필요합니다/),
    ).not.toBeInTheDocument();
  });

  it('SYSTEM_COMPOSED 에서 입력한 Alt Text 가 FULL_BLEED 로 전환해도 보존된다', () => {
    renderCreateForm();
    fireEvent.change(screen.getByPlaceholderText(/2026 AI 학과 해커톤/), {
      target: { value: '미리 입력한 alt' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    expect(screen.getByDisplayValue('미리 입력한 alt')).toBeInTheDocument();
  });

  it('FULL_BLEED 모드에서 태그/부제/CTA 라벨/이모지 입력란이 모두 숨겨진다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    expect(screen.queryByPlaceholderText('EVENT · 9.25 — 9.27')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('67개 동아리 · 80개 부스 · 중앙광장')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('박람회 자세히 보기')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('🍂')).not.toBeInTheDocument();
  });

  it('SYSTEM_COMPOSED 모드에서는 태그/부제/CTA 라벨/이모지 입력란이 모두 노출된다', () => {
    renderCreateForm();
    expect(screen.getByPlaceholderText('EVENT · 9.25 — 9.27')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('67개 동아리 · 80개 부스 · 중앙광장')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('박람회 자세히 보기')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('🍂')).toBeInTheDocument();
  });

  it('SYSTEM → FULL_BLEED → SYSTEM 왕복 시 태그 입력값이 보존된다', () => {
    renderCreateForm();
    const tagInput = screen.getByPlaceholderText('EVENT · 9.25 — 9.27');
    fireEvent.change(tagInput, { target: { value: '내가 입력한 태그' } });
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    expect(screen.queryByPlaceholderText('EVENT · 9.25 — 9.27')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /시스템 조합형/ }));
    expect(screen.getByDisplayValue('내가 입력한 태그')).toBeInTheDocument();
  });

  it('FULL_BLEED 모드에서 제목 입력란에 관리자 식별용 헬프 텍스트가 노출된다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    expect(
      screen.getByText('관리자 화면에서 배너를 구분하기 위한 이름입니다. 사용자에게는 노출되지 않습니다.'),
    ).toBeInTheDocument();
  });

  it('Alt Text 헬프 문구가 SYSTEM/FULL_BLEED 모두 동일 표현이다', () => {
    renderCreateForm();
    expect(
      screen.getByText('이미지가 보이지 않을 때 대신 보여주거나 읽어주는 설명입니다.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/포스터에 표시된 핵심 텍스트/)).not.toBeInTheDocument();
    expect(screen.queryByText(/완성 이미지형 배너로 전환할 때 접근성/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    expect(
      screen.getByText('이미지가 보이지 않을 때 대신 보여주거나 읽어주는 설명입니다.'),
    ).toBeInTheDocument();
  });

  it('초기 렌더는 연결 대상 NONE 라디오가 선택돼 있다', () => {
    renderCreateForm();
    expect(screen.getByRole('radio', { name: /연결 안 함/ })).toBeChecked();
  });

  it('URL 라디오 선택 시 URL 입력란만 노출된다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /외부\/내부 URL/ }));
    expect(screen.getByPlaceholderText(/https:\/\//)).toBeInTheDocument();
    expect(screen.queryByTestId('notice-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('club-selector')).not.toBeInTheDocument();
  });

  it('NOTICE 라디오 선택 시 NoticeSelector 만 노출된다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /공지 연결/ }));
    expect(screen.getByTestId('notice-selector')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/https:\/\//)).not.toBeInTheDocument();
    expect(screen.queryByTestId('club-selector')).not.toBeInTheDocument();
  });

  it('CLUB 라디오 선택 시 ClubSelector 만 노출된다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /동아리 연결/ }));
    expect(screen.getByTestId('club-selector')).toBeInTheDocument();
    expect(screen.queryByTestId('notice-selector')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/https:\/\//)).not.toBeInTheDocument();
  });

  it('URL → NOTICE 전환 시 URL 입력값이 자동 클리어된다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /외부\/내부 URL/ }));
    const urlInput = screen.getByPlaceholderText(/https:\/\//);
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByRole('radio', { name: /공지 연결/ }));
    expect(screen.queryByPlaceholderText(/https:\/\//)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /외부\/내부 URL/ }));
    expect((screen.getByPlaceholderText(/https:\/\//) as HTMLInputElement).value).toBe('');
  });

  it('edit 모드 + 비공개 공지 연결 시 경고 문구가 노출된다', () => {
    const initialValues = {
      id: 1,
      club: null,
      title: '비공개 공지 연결 배너',
      bannerImageUrl: null,
      linkUrl: null,
      active: true,
      displayOrder: 0,
      createdBy: { id: 1, name: 'admin' },
      createdAt: '2026-06-01T00:00:00',
      updatedAt: '2026-06-01T00:00:00',
      tag: null,
      subtitle: null,
      ctaLabel: null,
      emoji: null,
      palette: 'INK' as const,
      startAt: null,
      endAt: null,
      renderMode: 'SYSTEM_COMPOSED' as const,
      imageAltText: null,
      notice: { id: 42, title: '비공개', visibility: 'OFFICERS_ALL' as const, isAccessible: false },
      linkType: 'NOTICE' as const,
    };
    render(
      <AdminPromotionForm
        mode="edit"
        initialValues={initialValues}
        isSubmitting={false}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText(/비공개\/삭제 상태입니다/)).toBeInTheDocument();
  });
});
