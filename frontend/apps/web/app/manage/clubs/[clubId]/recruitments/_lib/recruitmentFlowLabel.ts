export function recruitmentStageLabels(useInterview: boolean): string[] {
  return useInterview ? ['서류', '면접', '최종'] : ['서류', '최종'];
}

export function recruitmentFlowLabel(useInterview: boolean): string {
  return recruitmentStageLabels(useInterview).join(' → ');
}
