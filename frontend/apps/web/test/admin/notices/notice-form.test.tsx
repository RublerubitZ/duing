import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
// ImageUploader 는 useFileUploadMutation 에 의존하므로 간단한 input 으로 대체
vi.mock('../../../app/_components/ImageUploader', () => ({
  ImageUploader: ({ value, onChange }: { value: string; onChange: (url: string) => void }) => (
    <input
      data-testid="cover-uploader"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

// NoticeRichEditor(지연 로드 래퍼)는 Tiptap 에 의존하므로 단순 div 로 대체
vi.mock('../../../app/_components/NoticeRichEditorLazy', () => ({
  NoticeRichEditorLazy: ({ value }: { value: string }) => <div data-testid="rich-editor">{value}</div>,
}));

const mockUseAdminActiveClubsQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminActiveClubsQuery: (...args: unknown[]) => mockUseAdminActiveClubsQuery(...args),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

/* ── 테스트 데이터 ───────────────────────────────────────────── */
import { NoticeForm } from '../../../app/admin/notices/_components/NoticeForm';
import {
  EMPTY_NOTICE_FORM,
  type NoticeFormState,
} from '../../../app/admin/notices/_lib/parseNoticeFormState';

function makeClubsResponse(clubs: { id: number; name: string }[] = []) {
  return {
    data: clubs,
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('NoticeForm', () => {
  it('coverImageUrl 이 빈 상태(EMPTY_NOTICE_FORM)에서 제출 버튼이 disabled 다', () => {
    mockUseAdminActiveClubsQuery.mockReturnValue(makeClubsResponse());

    render(
      <NoticeForm
        initialState={EMPTY_NOTICE_FORM}
        submitLabel="저장"
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: '저장' });
    expect(submitBtn).toBeDisabled();
  });

  it('visibility=CLUB_SCOPED 선택 시 동아리 목록 컨테이너가 렌더링된다', () => {
    mockUseAdminActiveClubsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isSuccess: false,
      isError: false,
      error: null,
    });

    render(
      <NoticeForm
        initialState={EMPTY_NOTICE_FORM}
        submitLabel="저장"
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    );

    // "특정 동아리" 버튼 클릭
    fireEvent.click(screen.getByRole('button', { name: '특정 동아리' }));

    // 동아리 목록 로딩 스피너(role="status")가 보여야 한다
    expect(screen.getByRole('status', { name: '동아리 목록 불러오는 중' })).toBeInTheDocument();
  });

  it('visibility 가 OFFICERS_ALL 이면 알림 발송 체크박스가 disabled 다', () => {
    mockUseAdminActiveClubsQuery.mockReturnValue(makeClubsResponse());

    const initialState: NoticeFormState = { ...EMPTY_NOTICE_FORM, visibility: 'OFFICERS_ALL' };

    render(
      <NoticeForm
        initialState={initialState}
        submitLabel="저장"
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    );

    const notifyCheckbox = screen.getByRole('checkbox', { name: /알림 발송/ });
    expect(notifyCheckbox).toBeDisabled();
  });

  it('태그가 8개일 때 9번째 태그 입력 후 Enter 를 눌러도 태그 수는 8개로 유지된다', () => {
    mockUseAdminActiveClubsQuery.mockReturnValue(makeClubsResponse());

    const eightTags = ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7', 'tag8'];
    const initialState: NoticeFormState = {
      ...EMPTY_NOTICE_FORM,
      // coverImageUrl 을 채워야 submit 버튼이 enabled 되지만 태그 테스트에는 무관
      tags: eightTags,
    };

    render(
      <NoticeForm
        initialState={initialState}
        submitLabel="저장"
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    );

    // 초기 태그 8개 확인
    const removeButtons = screen.getAllByRole('button', { name: /태그 제거/ });
    expect(removeButtons).toHaveLength(8);

    // 9번째 태그 입력 후 Enter
    const tagInput = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    fireEvent.change(tagInput, { target: { value: 'tag9' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    // 여전히 8개
    const removeButtonsAfter = screen.getAllByRole('button', { name: /태그 제거/ });
    expect(removeButtonsAfter).toHaveLength(8);
  });

  it('행사 정보 입력 필드(시작/종료/장소/주최/대상)와 리치 에디터가 렌더링된다', () => {
    mockUseAdminActiveClubsQuery.mockReturnValue(makeClubsResponse());

    render(
      <NoticeForm
        initialState={EMPTY_NOTICE_FORM}
        submitLabel="저장"
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('시작 일시')).toBeInTheDocument();
    expect(screen.getByText('종료 일시')).toBeInTheDocument();
    expect(screen.getByText('장소')).toBeInTheDocument();
    expect(screen.getByText('주최')).toBeInTheDocument();
    expect(screen.getByText('대상')).toBeInTheDocument();
    expect(screen.getByTestId('rich-editor')).toBeInTheDocument();
  });

  // 버튼이 든 입력 묶음을 <label> 로 감싸면 라벨 글자 클릭이 안의 첫 버튼 클릭이 된다.
  it('태그 라벨 글자를 눌러도 태그가 지워지지 않는다', () => {
    mockUseAdminActiveClubsQuery.mockReturnValue(makeClubsResponse());

    render(
      <NoticeForm
        initialState={{ ...EMPTY_NOTICE_FORM, tags: ['학사', '장학'] }}
        submitLabel="저장"
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('태그 (최대 8개)'));

    expect(screen.getAllByRole('button', { name: /태그 제거/ })).toHaveLength(2);
    // 라벨은 텍스트 입력란에만 묶여 있어 누르면 입력란으로 간다(태그 × 버튼이 눌리지 않는다).
    expect(screen.getByLabelText('태그 (최대 8개)')).toBe(screen.getByPlaceholderText(/태그 입력 후 Enter/));
  });

  it('노출 범위 라벨 글자를 눌러도 노출 범위가 바뀌지 않는다', () => {
    mockUseAdminActiveClubsQuery.mockReturnValue(makeClubsResponse());
    const onSubmit = vi.fn();

    render(
      <NoticeForm
        initialState={{
          ...EMPTY_NOTICE_FORM,
          title: '임원 공지',
          summary: '요약',
          coverImageUrl: 'https://files.duings.com/cover.png',
          visibility: 'OFFICERS_ALL',
        }}
        submitLabel="저장"
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByText('노출 범위'));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'OFFICERS_ALL' }));
  });
});

const clubsNamed = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `동아리 ${index + 1}` }));

const clubScopedState = (targetClubIds: number[]): NoticeFormState => ({
  ...EMPTY_NOTICE_FORM,
  title: '대상 공지',
  summary: '요약',
  coverImageUrl: 'https://files.duings.com/cover.png',
  visibility: 'CLUB_SCOPED',
  clubScopeRole: 'OFFICERS_ONLY',
  targetClubIds,
});

describe('NoticeForm — 특정 동아리 선택', () => {
  it('운영 중 동아리가 100곳을 넘어도 101번째를 고를 수 있다', () => {
    mockUseAdminActiveClubsQuery.mockReturnValue(makeClubsResponse(clubsNamed(101)));
    const onSubmit = vi.fn();

    render(<NoticeForm initialState={clubScopedState([])} submitLabel="저장" isSubmitting={false} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('checkbox', { name: '동아리 101' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ targetClubIds: [101] }));
  });

  it('목록 밖 기존 선택은 스크롤 상자 밖에 수로 보이고, 다른 동아리를 골라도 제출값에 남는다', () => {
    mockUseAdminActiveClubsQuery.mockReturnValue(makeClubsResponse(clubsNamed(2)));
    const onSubmit = vi.fn();

    render(<NoticeForm initialState={clubScopedState([1, 999])} submitLabel="저장" isSubmitting={false} onSubmit={onSubmit} />);

    const unlistedNotice = screen.getByText(/목록에 없는 동아리 1곳/);
    expect(unlistedNotice.closest('.overflow-y-auto')).toBeNull();
    expect(screen.getByRole('checkbox', { name: '동아리 1' }).closest('.overflow-y-auto')).not.toBeNull();
    expect(screen.getByText('선택된 동아리: 2개')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: '동아리 2' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ targetClubIds: [1, 999, 2] }));
  });

  it('목록에 없는 선택 빼기는 폼을 제출하지 않고, 목록 밖 id 만 뺀다', () => {
    mockUseAdminActiveClubsQuery.mockReturnValue(makeClubsResponse(clubsNamed(2)));
    const onSubmit = vi.fn();

    render(<NoticeForm initialState={clubScopedState([1, 999])} submitLabel="저장" isSubmitting={false} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: '목록에 없는 선택 빼기' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByText(/목록에 없는 동아리/)).toBeNull();
    // 버튼이 사라지므로 바뀐 선택 수를 화면 낭독기가 알린다.
    expect(screen.getByText('선택된 동아리: 1개')).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ targetClubIds: [1] }));
  });

  it('목록을 다 받기 전이나 실패했을 때는 목록 밖 줄을 그리지 않는다', () => {
    mockUseAdminActiveClubsQuery.mockReturnValue({
      data: undefined, isLoading: true, isSuccess: false, isError: false, error: null,
    });
    const { unmount } = render(
      <NoticeForm initialState={clubScopedState([1, 999])} submitLabel="저장" isSubmitting={false} onSubmit={vi.fn()} />,
    );
    expect(screen.queryByText(/목록에 없는 동아리/)).toBeNull();
    unmount();

    mockUseAdminActiveClubsQuery.mockReturnValue({
      data: undefined, isLoading: false, isSuccess: false, isError: true, error: new Error('실패'),
    });
    render(<NoticeForm initialState={clubScopedState([1, 999])} submitLabel="저장" isSubmitting={false} onSubmit={vi.fn()} />);
    expect(screen.queryByText(/목록에 없는 동아리/)).toBeNull();
  });
});
