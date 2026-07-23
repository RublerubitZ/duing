import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/_components/ImageUploader', () => ({
  ImageUploader: (props: { value: string; onChange: (url: string) => void; purpose: string }) => (
    <input
      data-testid={`uploader-${props.purpose}`}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));

vi.mock('@/app/_components/ImageWithFallback', () => ({
  ImageWithFallback: (props: { src: string | null | undefined; alt: string }) => (
    <div data-testid={`fallback-${props.alt}`} data-src={props.src ?? ''} />
  ),
}));

// 에디터 지연 로드 래퍼를 제어 가능한 더블로 대체한다.
// 마운트 시 onChange(value, 텍스트길이) 로 onCreate 베이스라인을 흉내내고,
// 이후 편집은 editorDouble.onChange 를 직접 호출해 재현한다.
const editorDouble = vi.hoisted(
  (): { onChange: ((html: string, textLength: number) => void) | null } => ({ onChange: null }),
);

vi.mock('@/app/_components/NoticeRichEditorLazy', async () => {
  const { useEffect, useRef } = await import('react');
  return {
    NoticeRichEditorLazy: (props: {
      value: string;
      onChange: (html: string, textLength: number) => void;
      features?: { headings?: boolean; image?: boolean };
    }) => {
      editorDouble.onChange = props.onChange;
      const { value, onChange } = props;
      // 실제 에디터의 onCreate 처럼 베이스라인은 마운트 1회만 발화한다.
      const firedRef = useRef(false);
      useEffect(() => {
        if (firedRef.current) return;
        firedRef.current = true;
        onChange(value, value.replace(/<[^>]*>/g, '').length);
      }, [value, onChange]);
      return (
        <div data-testid="desc-editor" data-features={JSON.stringify(props.features ?? null)}>
          {value}
        </div>
      );
    },
  };
});

import { ClubInfoForm } from '../../app/manage/clubs/[clubId]/info/_components/ClubInfoForm';
import type { AdminUpdateClubPayload, ClubDetail } from '@duing/types';

function makeDetail(overrides: Partial<ClubDetail> = {}): ClubDetail {
  return {
    id: 1,
    name: '두잉',
    category: 'ACADEMIC',
    division: '학술',
    college: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: [],
    tagline: null,
    centralClub: true,
    activeRecruitment: null,
    description: null,
    coverUrl: null,
    snsLinks: [],
    faqs: [],
    leaderId: 10,
    leaderName: '회장',
    photos: [],
    foundedYear: null,
    cohortNumber: null,
    location: null,
    contactPhone: null,
    contactVisibility: 'PUBLIC',
    activityFrequency: null,
    activeDays: [],
    membershipFeeAmount: null,
    feeCycle: 'NONE',
    highlights: [],
    projects: [],
    ...overrides,
  };
}

function fireEditorChange(html: string, textLength: number): void {
  const onChange = editorDouble.onChange;
  expect(onChange).not.toBeNull();
  if (onChange) act(() => onChange(html, textLength));
}

describe('ClubInfoForm 소개 에디터', () => {
  it('소개 자리에 리치 에디터가 렌더되고 features 는 둘 다 false 로 전달된다', () => {
    render(<ClubInfoForm detail={makeDetail()} mode="leader" mutation={{ mutateAsync: vi.fn(), isPending: false }} />);
    const editor = screen.getByTestId('desc-editor');
    expect(editor).toBeInTheDocument();
    expect(editor.getAttribute('data-features')).toBe(
      JSON.stringify({ headings: false, image: false, code: false }),
    );
    // 기존 plain textarea 는 사라진다
    expect(screen.queryByPlaceholderText(/자유롭게 적어주세요/)).toBeNull();
  });

  it('빈 소개면 카운터가 0/1,500 · 권장 300~800자로 표시된다', () => {
    render(<ClubInfoForm detail={makeDetail()} mode="leader" mutation={{ mutateAsync: vi.fn(), isPending: false }} />);
    expect(screen.getByText('0/1,500 · 권장 300~800자')).toBeInTheDocument();
  });

  it('1,500자를 초과하면 인라인 에러가 뜨고 저장이 차단된다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(<ClubInfoForm detail={makeDetail()} mode="leader" mutation={{ mutateAsync, isPending: false }} />);

    fireEditorChange(`<p>${'가'.repeat(1600)}</p>`, 1600);
    expect(screen.getByText('1,600/1,500 · 권장 300~800자')).toBeInTheDocument();
    expect(screen.getByText('소개글은 1,500자 이하로 줄여주세요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await Promise.resolve();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('소개를 수정하면 payload.description 에 HTML 이 담긴다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ description: '기존 소개' })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );

    fireEditorChange('<p>새로 쓴 소개</p>', 7);
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload: AdminUpdateClubPayload = mutateAsync.mock.calls[0]?.[0] ?? {};
    expect(payload.description).toBe('<p>새로 쓴 소개</p>');
  });

  it('소개를 전부 지우면(빈 <p></p>) payload.description 은 클리어값 빈 문자열로 담긴다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ description: '기존 소개' })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );

    // Tiptap 빈 문서 = getHTML()'<p></p>', textLength 0 → '' 로 정규화돼야 클리어된다.
    fireEditorChange('<p></p>', 0);
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload: AdminUpdateClubPayload = mutateAsync.mock.calls[0]?.[0] ?? {};
    expect(payload).toHaveProperty('description', '');
  });

  it('에디터를 열기만 하고 소개를 건드리지 않으면 payload 에 description 이 없다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ description: '기존 소개\n\n두 번째 문단' })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );

    // 소개는 손대지 않고 한줄 소개만 바꿔 payload 가 비지 않게 한다
    fireEvent.change(screen.getByLabelText('한줄 소개'), { target: { value: '새 한줄' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload: AdminUpdateClubPayload = mutateAsync.mock.calls[0]?.[0] ?? {};
    expect(payload).toHaveProperty('tagline', '새 한줄');
    expect(payload).not.toHaveProperty('description');
  });
});
