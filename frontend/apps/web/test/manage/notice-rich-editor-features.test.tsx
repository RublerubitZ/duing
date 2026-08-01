import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('features.code:false 면 코드 확장이 꺼져 <code> 가 렌더되지 않는다(스펙 제외 목록)', async () => {
    const { container } = render(
      <NoticeRichEditor
        value="<p>앞 <code>코드</code> 뒤</p>"
        format="HTML"
        onChange={() => {}}
        features={{ headings: false, image: false, code: false }}
      />,
    );
    await waitFor(() => expect(container.textContent).toContain('코드'));
    expect(container.querySelector('code')).toBeNull();
  });

  it('기본값은 코드 확장이 살아 있어 <code> 가 렌더된다(공지 무변경)', async () => {
    const { container } = render(
      <NoticeRichEditor value="<p>앞 <code>코드</code> 뒤</p>" format="HTML" onChange={() => {}} />,
    );
    await waitFor(() => expect(container.querySelector('code')).not.toBeNull());
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

// window.prompt 는 임베디드 브라우저에서 미지원(throw) — 링크 입력은 인라인 UI 여야 한다.
describe('NoticeRichEditor 링크 인라인 입력', () => {
  const selectAll = (container: HTMLElement) => {
    const proseMirror = container.querySelector('.ProseMirror');
    if (!proseMirror) throw new Error('ProseMirror 미렌더');
    fireEvent.keyDown(proseMirror, { key: 'a', ctrlKey: true });
  };

  it('링크 버튼 클릭 시 prompt 없이 인라인 URL 입력이 열리고, 다시 누르면 닫힌다', async () => {
    const promptSpy = vi.fn();
    vi.stubGlobal('prompt', promptSpy);
    render(<NoticeRichEditor value="<p>본문</p>" format="HTML" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('링크')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('링크'));
    expect(promptSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText('링크 URL')).toHaveValue('https://');
    fireEvent.click(screen.getByLabelText('링크'));
    expect(screen.queryByLabelText('링크 URL')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('선택 영역에 URL 적용 시 본문에 링크가 생기고 입력이 닫힌다', async () => {
    const handleChange = vi.fn();
    const { container } = render(<NoticeRichEditor value="<p>클릭</p>" format="HTML" onChange={handleChange} />);
    await waitFor(() => expect(screen.getByLabelText('링크')).toBeInTheDocument());
    selectAll(container);
    fireEvent.click(screen.getByLabelText('링크'));
    fireEvent.change(screen.getByLabelText('링크 URL'), { target: { value: 'https://duings.com' } });
    fireEvent.click(screen.getByText('적용'));
    const lastHtml = handleChange.mock.calls.at(-1)?.[0];
    expect(lastHtml).toContain('href="https://duings.com"');
    expect(screen.queryByLabelText('링크 URL')).toBeNull();
  });

  it('기존 링크 선택 시 현재 href 가 시드되고, 제거를 누르면 링크가 사라진다', async () => {
    const handleChange = vi.fn();
    const { container } = render(
      <NoticeRichEditor value='<p><a href="https://old.example">기존</a></p>' format="HTML" onChange={handleChange} />,
    );
    await waitFor(() => expect(screen.getByLabelText('링크')).toBeInTheDocument());
    selectAll(container);
    fireEvent.click(screen.getByLabelText('링크'));
    expect(screen.getByLabelText('링크 URL')).toHaveValue('https://old.example');
    fireEvent.click(screen.getByText('제거'));
    const lastHtml = handleChange.mock.calls.at(-1)?.[0];
    expect(lastHtml).not.toContain('href=');
    expect(screen.queryByLabelText('링크 URL')).toBeNull();
  });

  it('Escape 로 닫으면 본문은 그대로고, document 로 전파되지 않는다(모달 소비처 보호)', async () => {
    const handleChange = vi.fn();
    render(<NoticeRichEditor value="<p>본문</p>" format="HTML" onChange={handleChange} />);
    await waitFor(() => expect(screen.getByLabelText('링크')).toBeInTheDocument());
    const callsBefore = handleChange.mock.calls.length;
    fireEvent.click(screen.getByLabelText('링크'));
    const documentKeydownSpy = vi.fn();
    document.addEventListener('keydown', documentKeydownSpy);
    fireEvent.keyDown(screen.getByLabelText('링크 URL'), { key: 'Escape' });
    document.removeEventListener('keydown', documentKeydownSpy);
    expect(documentKeydownSpy).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('링크 URL')).toBeNull();
    expect(handleChange.mock.calls.length).toBe(callsBefore);
  });

  it('한글 IME 조합 확정 Enter(keyCode 229)는 적용을 트리거하지 않는다', async () => {
    render(<NoticeRichEditor value="<p>본문</p>" format="HTML" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('링크')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('링크'));
    fireEvent.keyDown(screen.getByLabelText('링크 URL'), { key: 'Enter', keyCode: 229 });
    // 조합 확정 Enter 는 무시 — 입력 행이 그대로 열려 있어야 한다.
    expect(screen.getByLabelText('링크 URL')).toBeInTheDocument();
  });
});
