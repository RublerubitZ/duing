'use client';

import { useState } from 'react';
import { useCompleteSubmissionBatchMutation, useDownloadSubmissionCsvMutation } from '@duing/hooks';
import type { CompleteSubmissionBatchResult, SubmissionBatchSummary } from '@duing/types';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { downloadBlobFile } from '@/app/_lib/downloadFile';
import { submissionCsvFileName } from './submissionBatches';

/** 완료 실패는 서버 메시지 우선(409 기취소·기완료 안내), 없으면 폴백 — 목록 탭 batchCompleteErrorMessage 동일. */
function completeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return '학교 제출 완료에 실패했어요. 잠시 후 다시 시도해 주세요.';
}

type Options = {
  /** 완료 성공 직후(스킵 유무와 무관) — 콕핏은 스킵 0 이면 여기서 이력 탭으로 이동한다. */
  onCompleted?: (result: CompleteSubmissionBatchResult) => void;
};

/**
 * 한 배치의 완료 처리·CSV 다운로드(스펙 v3 §7.3) — 상세 페이지와 전사 콕핏이 함께 쓴다(감사 #12 승격).
 * 확인 Dialog 열림·결과 Dialog 데이터를 훅이 들고, 스킵 0 은 토스트로 끝내고 스킵 있으면 결과를 채운다.
 * 목록 탭은 행 단위(배치 객체를 대상으로 잡음)라 이 훅을 쓰지 않는다.
 */
export function useSubmissionBatchActions({ onCompleted }: Options = {}) {
  const completeMutation = useCompleteSubmissionBatchMutation();
  const csvMutation = useDownloadSubmissionCsvMutation();
  const { addToast } = useToast();
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeResult, setCompleteResult] = useState<CompleteSubmissionBatchResult | null>(null);

  const confirmComplete = async (batchId: number) => {
    try {
      const result = await completeMutation.mutateAsync({ batchId });
      setCompleteOpen(false);
      // 스킵 0 은 토스트로 마무리, 스킵 있으면 확인 Dialog 를 닫고 결과 Dialog(제외 목록)를 연다.
      if (result.skippedCount === 0) addToast('학교 제출이 완료되었습니다.');
      else setCompleteResult(result);
      onCompleted?.(result);
    } catch (error) {
      // 실패 시 확인 Dialog 를 유지(completeOpen 그대로) — 서버 메시지 우선 안내만.
      addToast(completeErrorMessage(error), { variant: 'error' });
    }
  };

  const downloadCsv = async (batch: Pick<SubmissionBatchSummary, 'batchId' | 'submissionNo'>) => {
    try {
      const csvBlob = await csvMutation.mutateAsync({ batchId: batch.batchId });
      downloadBlobFile(submissionCsvFileName(batch.submissionNo), csvBlob);
    } catch {
      addToast('CSV 다운로드에 실패했어요. 잠시 후 다시 시도해 주세요.', { variant: 'error' });
    }
  };

  return {
    completeOpen,
    setCompleteOpen,
    completeResult,
    setCompleteResult,
    confirmComplete,
    downloadCsv,
    isCompleting: completeMutation.isPending,
    isDownloading: csvMutation.isPending,
  };
}
