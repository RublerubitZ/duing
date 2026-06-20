import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TermsAgreement } from '@/app/(auth)/signup/_components/TermsAgreement';

function renderViewLinks() {
  render(
    <TermsAgreement
      termsOfServiceAgreed={false}
      privacyPolicyAgreed={false}
      onChangeTermsOfService={vi.fn()}
      onChangePrivacyPolicy={vi.fn()}
    />,
  );
  return screen.getAllByRole('link', { name: '보기' });
}

describe('TermsAgreement', () => {
  it('약관·개인정보 "보기" 링크는 새 탭(target=_blank)에서 안전한 rel 로 열린다', () => {
    const viewLinks = renderViewLinks();

    expect(viewLinks).toHaveLength(2);
    for (const link of viewLinks) {
      // 새 탭에서 열어 가입 폼 입력값(인증코드·학번 등)이 같은 탭 이동으로 초기화되지 않게 한다.
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('"보기" 링크는 약관·개인정보 항목으로 각각 연결된다', () => {
    const viewLinks = renderViewLinks();

    expect(viewLinks[0]).toHaveAttribute('href', '/terms#terms');
    expect(viewLinks[1]).toHaveAttribute('href', '/terms#privacy');
  });
});
