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

// NoticeRichEditor 는 Tiptap 에 의존하므로 단순 div 로 대체
vi.mock('../../../app/admin/notices/_components/NoticeRichEditor', () => ({
  NoticeRichEditor: ({ value }: { value: string }) => <div data-testid="rich-editor">{value}</div>,
}));

const mockUseAdminClubsQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminClubsQuery: (...args: unknown[]) => mockUseAdminClubsQuery(...args),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
import { NoticeForm } from '../../../app/admin/notices/_components/NoticeForm';
import {
  EMPTY_NOTICE_FORM,
  type NoticeFormState,
} from '../../../app/admin/notices/_lib/parseNoticeFormState';

function makeClubsResponse(clubs: { id: number; name: string }[] = []) {
  return {
    data: { content: clubs, totalPages: 1, totalElements: clubs.length },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('NoticeForm', () => {
  it('coverImageUrl 이 빈 상태(EMPTY_NOTICE_FORM)에서 제출 버튼이 disabled 다', () => {
    mockUseAdminClubsQuery.mockReturnValue(makeClubsResponse());

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
    mockUseAdminClubsQuery.mockReturnValue({
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

    // 동아리 목록 로딩 중 텍스트가 보여야 한다
    expect(screen.getByText('동아리 목록 불러오는 중…')).toBeInTheDocument();
  });

  it('visibility 가 OFFICERS_ALL 이면 알림 발송 체크박스가 disabled 다', () => {
    mockUseAdminClubsQuery.mockReturnValue(makeClubsResponse());

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
    mockUseAdminClubsQuery.mockReturnValue(makeClubsResponse());

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
    mockUseAdminClubsQuery.mockReturnValue(makeClubsResponse());

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
});
