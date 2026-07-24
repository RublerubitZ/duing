import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { RecruitmentPreviewData } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentPreview';
import { RecruitmentPreview } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentPreview';

function previewData(over: Partial<RecruitmentPreviewData> = {}): RecruitmentPreviewData {
  return {
    title: '10기 신입 모집',
    startDate: '2026-09-15',
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
    render(<RecruitmentPreview data={previewData({ title: '', endDate: null })} />);
    expect(screen.getByText('상시모집')).toBeInTheDocument();
    expect(screen.getByText('모집명을 입력하세요')).toBeInTheDocument();
  });
});
