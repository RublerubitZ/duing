import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { RecruitmentPreviewData } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentPreview';
import { RecruitmentPreview } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentPreview';

function previewData(over: Partial<RecruitmentPreviewData> = {}): RecruitmentPreviewData {
  return {
    title: '10기 신입 모집',
    startDate: '2026-09-15',
    isAlwaysOpen: false,
    endDate: '2026-09-27',
    capacity: 20,
    applicationMode: 'SELF',
    externalFormUrl: '',
    useInterview: true,
    targetRole: 'MEMBER',
    content: '',
    questions: [
      { key: 'q1', id: null, text: '지원 동기를 알려주세요', type: 'TEXT', required: true, choices: [] },
      {
        key: 'q2',
        id: null,
        text: '관심 분야는?',
        type: 'MULTIPLE_CHOICE',
        required: false,
        choices: [
          { key: 'c1', id: null, label: '웹' },
          { key: 'c2', id: null, label: '앱' },
        ],
      },
    ],
    ...over,
  };
}

describe('RecruitmentPreview', () => {
  it('자체 폼: 모집 정보 → 질문 목록 → 제출하기 순으로 렌더한다', () => {
    render(<RecruitmentPreview data={previewData()} />);
    expect(screen.getByText('10기 신입 모집')).toBeInTheDocument();
    expect(screen.getByText(/정원 20명/)).toBeInTheDocument();
    expect(screen.getByText('지원서 · 2문항')).toBeInTheDocument();
    expect(screen.getByText('지원 동기를 알려주세요')).toBeInTheDocument();
    expect(screen.getByText('웹')).toBeInTheDocument();
    expect(screen.getByText('제출하기')).toBeInTheDocument();
  });

  it('안내문이 있으면 질문보다 먼저 Markdown 으로 렌더한다', () => {
    render(<RecruitmentPreview data={previewData({ content: '## 환영합니다\n\n- OT 9/30' })} />);
    expect(screen.getByRole('heading', { name: '환영합니다' })).toBeInTheDocument();
    expect(screen.getByText('OT 9/30')).toBeInTheDocument();
  });

  it('외부 폼: 링크 안내 카드와 지원 폼 열기 버튼을 렌더하고 질문은 렌더하지 않는다', () => {
    render(
      <RecruitmentPreview
        data={previewData({ applicationMode: 'EXTERNAL', externalFormUrl: 'https://forms.gle/abc' })}
      />,
    );
    expect(screen.getByText('외부 폼으로 지원해요')).toBeInTheDocument();
    expect(screen.getByText('forms.gle/abc')).toBeInTheDocument();
    expect(screen.getByText('지원 폼 열기 →')).toBeInTheDocument();
    expect(screen.queryByText('지원 동기를 알려주세요')).not.toBeInTheDocument();
  });

  it('상시모집이면 상시모집 라벨, 제목 미입력이면 플레이스홀더를 보여준다', () => {
    render(<RecruitmentPreview data={previewData({ title: '', isAlwaysOpen: true, endDate: null })} />);
    // 상태 칩과 기간 줄 둘 다 상시모집으로 말한다.
    expect(screen.getAllByText(/상시모집/)).not.toHaveLength(0);
    expect(screen.getByText('모집명을 입력하세요')).toBeInTheDocument();
  });

  // 종료일을 아직 안 적은 것과 "종료일 없는 모집(상시)" 은 다른 상태다 — 전자를 상시모집이라 부르면
  // 작성자가 상시모집으로 공개된다고 오해한다.
  it('상시모집이 아닌데 종료일이 비어 있으면 기간 미정으로 표기한다', () => {
    render(<RecruitmentPreview data={previewData({ isAlwaysOpen: false, endDate: null })} />);
    expect(screen.getByText('기간 미정')).toBeInTheDocument();
    expect(screen.queryByText('상시모집')).not.toBeInTheDocument();
    expect(screen.getByText(/2026-09-15 ~ —/)).toBeInTheDocument();
  });
});
