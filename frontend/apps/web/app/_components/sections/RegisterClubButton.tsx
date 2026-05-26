'use client';

import { ArrowRight } from '@/components/duing/Icon';

export function RegisterClubButton() {
  const handleClick = () => {
    alert('동아리 등록 신청은 운영자에게 문의해주세요.');
  };

  return (
    <button type="button" onClick={handleClick} className="btn btn-primary btn-big rounded-lg">
      동아리 등록 신청
      <ArrowRight />
    </button>
  );
}
