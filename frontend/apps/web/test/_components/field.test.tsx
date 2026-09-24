import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from '../../app/_components/Field';

describe('Field', () => {
  it('오류가 있으면 입력에 aria-invalid·aria-describedby 를 붙여 오류 문구와 연결하고, 없으면 붙이지 않는다', () => {
    const { rerender } = render(
      <Field id="sample" label="이름" error="이름은 필수입니다.">
        <input id="sample" />
      </Field>,
    );
    const input = screen.getByLabelText('이름');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'sample-error');
    expect(document.getElementById('sample-error')).toHaveTextContent('이름은 필수입니다.');
    expect(input).toHaveAccessibleDescription('이름은 필수입니다.');

    rerender(
      <Field id="sample" label="이름">
        <input id="sample" />
      </Field>,
    );
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(document.getElementById('sample-error')).toBeNull();
  });
});
