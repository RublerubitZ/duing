'use client';

import { useOptionalToast } from '@/app/_components/toast/ToastProvider';
import { toRoute } from '@/app/_lib/route';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';

// PC 푸터 "동아리 신청" 항목 — 링크가 아니라 버튼이다. 동아리 등록은 서비스 안 플로우가 아니라
// 총동연(총동아리연합회) 심사를 거치므로, 누르면 안내 토스트를 띄우고 1:1 문의로 이어 준다.
// (예전 홈 LeaderCta "우리 동아리도 두잉에 등록하고 싶어요" 의 자리를 푸터로 옮긴 것.)
// 푸터는 모든 페이지에 깔리는 공용이라 토스트 프로바이더를 전제하지 않는다(useOptionalToast) —
// 프로바이더 밖(격리 테스트 등)에서는 안내 없이 1:1 문의로 바로 보낸다.
export function FooterClubApplyCta({ className }: { className?: string }) {
  const addToast = useOptionalToast();
  const router = useGuardedRouter();

  const goToInquiry = () => router.push(toRoute('/me/inquiries/new'));

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (!addToast) {
          goToInquiry();
          return;
        }
        addToast('동아리 신청은 총동연(총동아리연합회)에 문의해 주세요.', {
          action: { label: '1:1 문의', onClick: goToInquiry },
        });
      }}
    >
      우리 동아리도 신청하고 싶어요
    </button>
  );
}
