import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminSlotStrip } from '@/app/admin/facility-bookings/_components/AdminSlotStrip';

describe('AdminSlotStrip', () => {
  it('겹침 항목은 source 값과 무관하게 점유(조직명 또는 "점유")로 그리고, 신청 구간과 겹치면 충돌이다', () => {
    render(
      <AdminSlotStrip
        startTime="18:00"
        endTime="20:00"
        overlaps={[
          { source: 'SCHOOL', organization: '문화팀', startTime: '18:00', endTime: '19:00' },
          { source: 'INTERNAL', organization: '비호응원단', startTime: '20:00', endTime: '21:00' },
          // 계약 밖 source — BE 관리자 상세 overlaps 는 SCHOOL·INTERNAL 만 내린다(대기 겹침은 숫자로만).
          // 미지 값이 와도 숨기지 않고 점유로 폴백한다(P2-16: 옛 '대기' 점선 분기는 도달 불가 죽은 코드였다).
          { source: 'PENDING', organization: '', startTime: '09:00', endTime: '10:00' },
        ]}
      />,
    );
    expect(screen.getByText('충돌')).toBeInTheDocument(); // 18시: 신청 ∩ SCHOOL
    expect(screen.getByText('신청')).toBeInTheDocument(); // 19시: 신청만
    expect(screen.getByText('비호응원단')).toBeInTheDocument(); // 20시: 신청 밖 INTERNAL → 조직명
    expect(screen.getByText('점유')).toBeInTheDocument(); // 09시: 계약 밖 source, 조직명 없음 → 점유
    expect(screen.queryByText('대기')).not.toBeInTheDocument();
    expect(screen.getAllByText('가능')).toHaveLength(9); // 13칸 − 충돌1 − 신청1 − 점유2
  });
});
