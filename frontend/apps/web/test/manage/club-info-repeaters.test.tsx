import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ClubProject, ClubSnsLink } from '@duing/types';

import { HighlightsRepeater } from '../../app/manage/clubs/[clubId]/info/_components/HighlightsRepeater';
import { ProjectsRepeater } from '../../app/manage/clubs/[clubId]/info/_components/ProjectsRepeater';
import { SnsLinksRepeater } from '../../app/manage/clubs/[clubId]/info/_components/SnsLinksRepeater';
import { TagsInput } from '../../app/manage/clubs/[clubId]/info/_components/TagsInput';
import { ContactVisibilityField } from '../../app/manage/clubs/[clubId]/info/_components/ContactVisibilityField';

// dnd 동작(실제 드래그 정렬)은 jsdom 한계로 제외 — Task 9 실브라우저 QA.
// 여기서는 렌더·추가/삭제/제한/선택 상호작용만 검증한다.

function ControlledProjects({ initial }: { initial: ClubProject[] }) {
  const [projects, setProjects] = useState(initial);
  return <ProjectsRepeater value={projects} onChange={setProjects} readOnly={false} />;
}

function ControlledSnsLinks({ initial }: { initial: ClubSnsLink[] }) {
  const [links, setLinks] = useState(initial);
  return <SnsLinksRepeater value={links} onChange={setLinks} readOnly={false} />;
}

function ControlledTags({ initial }: { initial: string[] }) {
  const [tags, setTags] = useState(initial);
  return <TagsInput value={tags} onChange={setTags} />;
}

describe('HighlightsRepeater (재작성)', () => {
  it('강조 항목이 7개면 추가 버튼이 비활성화되고 7/7 카운터가 보인다', () => {
    render(
      <HighlightsRepeater
        value={['a', 'b', 'c', 'd', 'e', 'f', 'g']}
        onChange={vi.fn()}
        readOnly={false}
      />,
    );
    const addButton = screen.getByRole('button', { name: /항목 추가/ });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveTextContent('7/7');
  });

  it('강조 항목이 9개(레거시)여도 목록은 전부 렌더되고 삭제는 가능하다', () => {
    const onChange = vi.fn();
    const legacy = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    render(<HighlightsRepeater value={legacy} onChange={onChange} readOnly={false} />);

    expect(screen.getAllByRole('textbox')).toHaveLength(9);

    const deleteButtons = screen.getAllByRole('button', { name: '강조 항목 삭제' });
    fireEvent.click(deleteButtons[0]!);
    expect(onChange).toHaveBeenLastCalledWith(['2', '3', '4', '5', '6', '7', '8', '9']);
  });
});

describe('ProjectsRepeater', () => {
  it('프로젝트 추가 시 아이콘 선택기에서 선택한 아이콘이 카드에 반영된다', async () => {
    const user = userEvent.setup();
    render(<ControlledProjects initial={[]} />);

    await user.click(screen.getByRole('button', { name: /프로젝트 추가/ }));

    // 추가 직후 편집 패널이 열리고 아이콘 선택기가 노출된다. 기본 아이콘은 CODE.
    expect(screen.getByRole('radio', { name: 'CODE' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: 'TROPHY' }));

    expect(screen.getByRole('radio', { name: 'TROPHY' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'CODE' })).toHaveAttribute('aria-checked', 'false');
  });

  it('프로젝트가 6개면 추가 버튼이 비활성화된다', () => {
    const projects: ClubProject[] = Array.from({ length: 6 }, (_, index) => ({
      icon: 'CODE',
      title: `프로젝트 ${index + 1}`,
      subtitle: null,
    }));
    render(<ProjectsRepeater value={projects} onChange={vi.fn()} readOnly={false} />);

    expect(screen.getByRole('button', { name: /프로젝트 추가/ })).toBeDisabled();
  });
});

describe('SnsLinksRepeater (기타 라벨 입력)', () => {
  it('SNS 플랫폼에서 기타를 선택하면 플랫폼명 입력이 나타난다', async () => {
    const user = userEvent.setup();
    render(<ControlledSnsLinks initial={[{ platform: 'INSTAGRAM', label: null, url: '' }]} />);

    expect(screen.queryByPlaceholderText(/플랫폼명/)).toBeNull();

    await user.selectOptions(screen.getByRole('combobox'), 'OTHER');

    expect(screen.getByPlaceholderText(/플랫폼명/)).toBeInTheDocument();
  });

  it('기타에서 기본 플랫폼으로 되돌리면 label 이 null 로 초기화된다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SnsLinksRepeater
        value={[{ platform: 'OTHER', label: 'GitHub', url: 'https://github.com/x' }]}
        onChange={onChange}
        readOnly={false}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), 'INSTAGRAM');

    expect(onChange).toHaveBeenLastCalledWith([
      { platform: 'INSTAGRAM', label: null, url: 'https://github.com/x' },
    ]);
  });
});

describe('TagsInput (maxTagLength)', () => {
  it('태그는 5자를 초과해 입력할 수 없다', async () => {
    const user = userEvent.setup();
    render(<TagsInput value={[]} onChange={vi.fn()} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('maxlength', '5');

    await user.type(input, '123456');
    expect(input).toHaveValue('12345');
  });

  it('keyCode 229(한글 IME 조합 중) Enter 로는 태그가 등록되지 않는다', () => {
    const onChange = vi.fn();
    render(<TagsInput value={[]} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '코딩' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });

    expect(onChange).not.toHaveBeenCalled();
  });
});

// 한글 IME 조합·keyCode 229 모바일 키보드는 ',' keydown 분기를 건너뛰어 쉼표가 값으로만 들어온다(#1338).
describe('TagsInput (쉼표 구분)', () => {
  it('keydown 없이 값으로 들어온 쉼표 앞은 태그로 넣고 뒤만 입력란에 남긴다', () => {
    const onChange = vi.fn();
    render(<TagsInput value={[]} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '축구,풋' } });

    expect(onChange).toHaveBeenCalledWith(['축구']);
    expect(input).toHaveValue('풋');
  });

  it('조합 중에는 나누지 않고 조합이 끝날 때 나눈다', () => {
    const onChange = vi.fn();
    render(<TagsInput value={[]} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '축구,풋' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('축구,풋');

    fireEvent.compositionEnd(input);
    expect(onChange).toHaveBeenCalledWith(['축구']);
    expect(input).toHaveValue('풋');
  });

  it('한 번에 들어온 여러 조각은 중복을 빼고 한 번에 넘긴다', () => {
    const onChange = vi.fn();
    render(<TagsInput value={[]} onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '가,가,나' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['가']);
  });

  it('여러 조각이 들어와도 태그는 5개를 넘지 않는다', () => {
    const onChange = vi.fn();
    render(<TagsInput value={['a', 'b', 'c', 'd']} onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '가,나,' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['a', 'b', 'c', 'd', '가']);
  });

  it('한도를 채우면 남은 조각도 버려, 칩을 지워 입력란이 다시 나타날 때 숨은 글자가 없다', () => {
    render(<ControlledTags initial={['a', 'b', 'c', 'd']} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '가,나,다' } });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '태그 a 삭제' }));
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('쉼표 뒤 공백은 지워 다음 태그가 5자 칸을 온전히 쓴다 — 쉼표가 없으면 그대로 둔다', () => {
    const onChange = vi.fn();
    render(<TagsInput value={[]} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: ' 축' } });
    expect(input).toHaveValue(' 축');

    fireEvent.change(input, { target: { value: ' 축, 풋' } });
    expect(onChange).toHaveBeenCalledWith(['축']);
    expect(input).toHaveValue('풋');
  });
});

describe('ContactVisibilityField', () => {
  it('공개 범위 라디오에서 비공개를 선택하면 onChange 가 PRIVATE 로 호출된다', () => {
    const onChange = vi.fn();
    render(
      <ContactVisibilityField
        phone="010-1234-5678"
        value="PUBLIC"
        onChange={onChange}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: '비공개' }));
    expect(onChange).toHaveBeenLastCalledWith('PRIVATE');
  });

  it('회장 미등록이면 전화 대신 안내 문구가 보인다', () => {
    render(
      <ContactVisibilityField phone={null} value="PRIVATE" onChange={vi.fn()} disabled={false} />,
    );

    expect(screen.getByText(/회장 미등록/)).toBeInTheDocument();
  });
});
