import { describe, expect, it } from 'vitest';
import { formatPhone } from '../../../app/(auth)/signup/_components/PhoneInput';

describe('formatPhone', () => {
  it('11자리 숫자를 010-XXXX-XXXX 형식으로 포맷팅한다', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
  });

  it('숫자 외 문자는 모두 제거한다', () => {
    expect(formatPhone('abc010!1234@5678zz')).toBe('010-1234-5678');
  });

  it('7자리 미만 입력은 첫 하이픈만 삽입한다', () => {
    expect(formatPhone('010123')).toBe('010-123');
  });

  it('3자리 미만은 하이픈 없이 그대로 둔다', () => {
    expect(formatPhone('01')).toBe('01');
  });

  it('11자리 초과 입력은 잘라낸다', () => {
    expect(formatPhone('010123456789999')).toBe('010-1234-5678');
  });
});
