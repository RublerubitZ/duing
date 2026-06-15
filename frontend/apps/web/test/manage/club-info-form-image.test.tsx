import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockImageUploaderCalls: Array<{
  value: string;
  purpose: string;
  aspectRatio?: string;
  testId: string;
}> = [];

vi.mock('@/app/_components/ImageUploader', () => ({
  ImageUploader: (props: {
    value: string;
    onChange: (url: string) => void;
    purpose: string;
    aspectRatio?: string;
    altText?: string;
  }) => {
    const testId =
      props.purpose === 'LOGO' ? 'logo-uploader'
      : props.purpose === 'COVER' ? 'cover-uploader'
      : `uploader-${props.purpose}`;
    mockImageUploaderCalls.push({
      value: props.value,
      purpose: props.purpose,
      aspectRatio: props.aspectRatio,
      testId,
    });
    return (
      <input
        data-testid={testId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  },
}));

vi.mock('@/app/_components/ImageWithFallback', () => ({
  ImageWithFallback: (props: { src: string | null | undefined; alt: string }) => (
    <div data-testid={`fallback-${props.alt}`} data-src={props.src ?? ''} />
  ),
}));

vi.mock('@duing/hooks', () => ({
  useUpdateClubMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

import { ClubInfoForm } from '../../app/manage/clubs/[clubId]/info/_components/ClubInfoForm';
import type { ClubDetail } from '@duing/types';

function makeDetail(overrides: Partial<ClubDetail> = {}): ClubDetail {
  return {
    id: 1,
    name: '두잉',
    category: 'ACADEMIC',
    division: '소프트웨어',
    college: 'IT_ENGINEERING',
    description: null,
    logoUrl: 'https://imgur.com/old-logo.png',
    coverUrl: 'https://imgur.com/old-cover.png',
    tags: [],
    snsLinks: [],
    faqs: [],
    foundedYear: null,
    cohortNumber: null,
    location: null,
    contactEmail: null,
    activityFrequency: null,
    activeDays: [],
    membershipFee: null,
    tagline: null,
    highlights: [],
    majorProjects: null,
    leaderName: '리더',
    status: 'CERTIFIED',
    centralClub: false,
    photoCount: 0,
    ...overrides,
  } as ClubDetail;
}

describe('ClubInfoForm 의 이미지 입력', () => {
  beforeEach(() => {
    mockImageUploaderCalls.length = 0;
  });

  it('logoUrl 영역에 ImageUploader 가 purpose=LOGO + aspectRatio=1/1 로 렌더된다', () => {
    render(<ClubInfoForm clubId={1} detail={makeDetail()} readOnly={false} />);
    expect(screen.getByTestId('logo-uploader')).toBeInTheDocument();
    const logoCall = mockImageUploaderCalls.find((c) => c.purpose === 'LOGO');
    expect(logoCall?.aspectRatio).toBe('1/1');
    expect(logoCall?.value).toBe('https://imgur.com/old-logo.png');
  });

  it('coverUrl 영역에 ImageUploader 가 purpose=COVER + aspectRatio=16/9 로 렌더된다', () => {
    render(<ClubInfoForm clubId={1} detail={makeDetail()} readOnly={false} />);
    expect(screen.getByTestId('cover-uploader')).toBeInTheDocument();
    const coverCall = mockImageUploaderCalls.find((c) => c.purpose === 'COVER');
    expect(coverCall?.aspectRatio).toBe('16/9');
    expect(coverCall?.value).toBe('https://imgur.com/old-cover.png');
  });

  it('기존 URL 입력 필드가 남아있지 않다', () => {
    const { container } = render(
      <ClubInfoForm clubId={1} detail={makeDetail()} readOnly={false} />,
    );
    const urlInputs = container.querySelectorAll('input[type="url"]');
    urlInputs.forEach((node) => {
      expect(node.getAttribute('id')).not.toBe('f-logo');
      expect(node.getAttribute('id')).not.toBe('f-cover');
    });
  });

  it('readOnly=true 면 ImageUploader 대신 ImageWithFallback 으로 표시 전용 렌더된다', () => {
    render(<ClubInfoForm clubId={1} detail={makeDetail()} readOnly={true} />);
    expect(screen.queryByTestId('logo-uploader')).toBeNull();
    expect(screen.queryByTestId('cover-uploader')).toBeNull();
    const logoFallback = screen.getByTestId('fallback-로고');
    expect(logoFallback.getAttribute('data-src')).toBe('https://imgur.com/old-logo.png');
    const coverFallback = screen.getByTestId('fallback-커버');
    expect(coverFallback.getAttribute('data-src')).toBe('https://imgur.com/old-cover.png');
  });
});
