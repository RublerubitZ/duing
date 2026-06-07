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
  ClubSelector: () => <div data-testid="club-selector" />,
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
});
