import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  FormSegment,
  FormSwitch,
  SettingRow,
} from '@/app/manage/clubs/[clubId]/recruitments/_components/form-controls';

describe('FormSegment', () => {
  const options = [
    { value: 'SELF', label: '자체 폼' },
    { value: 'EXTERNAL', label: '외부 폼' },
  ] as const;

  it('radiogroup/radio 시맨틱으로 렌더하고 선택 상태를 aria-checked 로 표현한다', () => {
    render(<FormSegment options={options} value="SELF" onChange={vi.fn()} ariaLabel="지원 방식" />);
    expect(screen.getByRole('radiogroup', { name: '지원 방식' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '자체 폼' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '외부 폼' })).not.toBeChecked();
  });

  it('클릭 시 해당 value 로 onChange 를 호출한다', () => {
    const onChange = vi.fn();
    render(<FormSegment options={options} value="SELF" onChange={onChange} ariaLabel="지원 방식" />);
    fireEvent.click(screen.getByRole('radio', { name: '외부 폼' }));
    expect(onChange).toHaveBeenCalledWith('EXTERNAL');
  });
});

describe('FormSwitch', () => {
  it('switch 시맨틱 + 클릭 시 반전 값으로 onChange', () => {
    const onChange = vi.fn();
    render(<FormSwitch checked={false} onChange={onChange} ariaLabel="면접 진행" />);
    const toggle = screen.getByRole('switch', { name: '면접 진행' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('SettingRow', () => {
  it('제목·설명·컨트롤을 렌더한다', () => {
    render(
      <SettingRow title="지원자 수 공개" desc="모집 페이지에 현재 지원자 수를 보여줄지">
        <span>컨트롤</span>
      </SettingRow>,
    );
    expect(screen.getByText('지원자 수 공개')).toBeInTheDocument();
    expect(screen.getByText('모집 페이지에 현재 지원자 수를 보여줄지')).toBeInTheDocument();
    expect(screen.getByText('컨트롤')).toBeInTheDocument();
  });
});
