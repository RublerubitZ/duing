import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FacilityUsageGuide } from '../../app/facilities/_components/FacilityUsageGuide';

// 접힘 상태를 펼친다. jsdom 이 summary 클릭의 토글 동작을 구현하므로 클릭으로 연다.
function expandGuide() {
  fireEvent.click(screen.getByText('학생회관 시설물 사용신청 안내'));
}

describe('FacilityUsageGuide', () => {
  it('안내 제목과 상시 노출 힌트 문구를 렌더한다', () => {
    render(<FacilityUsageGuide />);
    expect(
      screen.getByRole('heading', { name: '학생회관 시설물 사용신청 안내' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('시설물 이용은 사전 신청이 필요해요. 신청 방법과 준수 사항을 아래에서 확인하세요.'),
    ).toBeInTheDocument();
  });

  it('제목을 누르면 준수 사항과 신청 규정이 펼쳐진다', () => {
    render(<FacilityUsageGuide />);
    expect(screen.getByText('이용 준수 사항')).not.toBeVisible();

    expandGuide();

    expect(screen.getByText('이용 준수 사항')).toBeVisible();
    expect(screen.getByText('가. 시설물 내에서 담배를 피우지 말 것')).toBeVisible();
    expect(screen.getByText('마. 음식물 반입 금지')).toBeVisible();
    expect(screen.getByText('사용 신청')).toBeVisible();
    expect(screen.getByText('이용 시간: 평일 9:00 ~ 21:30')).toBeVisible();
    expect(screen.getByText(/하루 최대 3시간/)).toBeVisible();
    expect(screen.getByText(/사용 7일전부터 사용 전날 12:00까지/)).toBeVisible();
  });

  it('신청서 안내 외부 링크가 새 창으로 안전하게 열리고 새 창 열림을 알린다', () => {
    render(<FacilityUsageGuide />);
    expandGuide();

    const externalLink = screen.getByRole('link', { name: /신청서 다운로드·자세한 안내/ });
    expect(externalLink).toHaveAttribute('href', 'https://www.daegu.ac.kr/room/detail');
    expect(externalLink).toHaveAttribute('target', '_blank');
    expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(externalLink).toHaveAccessibleName(/새 창 열림/);
  });

  it('이메일·전화 문의가 mailto/tel 링크로 연결된다', () => {
    render(<FacilityUsageGuide />);
    expandGuide();

    expect(screen.getByRole('link', { name: 'sd@daegu.ac.kr' })).toHaveAttribute(
      'href',
      'mailto:sd@daegu.ac.kr',
    );
    expect(screen.getByRole('link', { name: '053-850-5214' })).toHaveAttribute(
      'href',
      'tel:053-850-5214',
    );
  });
});
