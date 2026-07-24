import { describe, it, expect } from 'vitest';
import {
  recruitmentFlowLabel,
  recruitmentStageLabels,
} from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentFlowLabel';

describe('recruitmentStageLabels / recruitmentFlowLabel', () => {
  it('면접을 진행하면 서류 → 면접 → 최종 3단계다', () => {
    expect(recruitmentStageLabels(true)).toEqual(['서류', '면접', '최종']);
    expect(recruitmentFlowLabel(true)).toBe('서류 → 면접 → 최종');
  });

  it('면접이 없으면 서류 → 최종 2단계다', () => {
    expect(recruitmentStageLabels(false)).toEqual(['서류', '최종']);
    expect(recruitmentFlowLabel(false)).toBe('서류 → 최종');
  });
});
