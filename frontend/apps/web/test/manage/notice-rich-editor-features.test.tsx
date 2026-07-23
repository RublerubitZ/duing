import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@duing/hooks', () => ({
  useFileUploadMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { NoticeRichEditor } from '../../app/_components/NoticeRichEditor';

describe('NoticeRichEditor features 구성', () => {
  it('기본값(features 미지정)은 공지와 동일하게 제목·이미지 버튼을 모두 노출한다', async () => {
    render(<NoticeRichEditor value="<p>x</p>" format="HTML" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('굵게')).toBeInTheDocument());
    expect(screen.getByLabelText('제목 2')).toBeInTheDocument();
    expect(screen.getByLabelText('제목 3')).toBeInTheDocument();
    expect(screen.getByLabelText('이미지')).toBeInTheDocument();
  });

  it('features={{ headings:false, image:false }} 면 제목·이미지 버튼이 사라지고 기본 서식은 남는다', async () => {
    render(
      <NoticeRichEditor
        value="<p>x</p>"
        format="HTML"
        onChange={() => {}}
        features={{ headings: false, image: false }}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText('굵게')).toBeInTheDocument());
    // 헤딩·이미지 버튼은 미렌더
    expect(screen.queryByLabelText('제목 2')).toBeNull();
    expect(screen.queryByLabelText('제목 3')).toBeNull();
    expect(screen.queryByLabelText('이미지')).toBeNull();
    // 허용 서식은 유지
    expect(screen.getByLabelText('기울임')).toBeInTheDocument();
    expect(screen.getByLabelText('링크')).toBeInTheDocument();
    expect(screen.getByLabelText('글머리 목록')).toBeInTheDocument();
    expect(screen.getByLabelText('인용')).toBeInTheDocument();
  });

  it('image:false 면 본문 이미지 안내 문구도 사라진다', async () => {
    render(
      <NoticeRichEditor
        value="<p>x</p>"
        format="HTML"
        onChange={() => {}}
        features={{ headings: false, image: false }}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText('굵게')).toBeInTheDocument());
    expect(screen.queryByText(/본문에 인라인 삽입/)).toBeNull();
  });
});
