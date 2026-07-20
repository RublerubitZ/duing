import type { SubmissionAuditEntry } from '@duing/types';
import { AUDIT_ACTION_LABELS } from '../_lib/submissionBatches';

type Props = {
  audits: SubmissionAuditEntry[];
};

/** 'YYYY-MM-DDTHH:mm:ss'(BE 가 이미 KST 환산) → 'YYYY-MM-DD HH:mm'. */
function formatAuditTime(createdAt: string): string {
  return createdAt.slice(0, 16).replace('T', ' ');
}

/**
 * 제출 목록 운영 기록(스펙 v3 §7.3) — 감사 로그를 시각순으로 나열한다.
 * 관리자 탈퇴 시 '(탈퇴한 관리자)', COMPLETED 요약(detail)은 부속 줄로 그대로 노출.
 * IP 는 응답에 있어도 표시하지 않는다(계획 결정 사항 6).
 */
export function SubmissionAuditHistory({ audits }: Props) {
  if (audits.length === 0) {
    return <p className="text-sm text-charcoal-3">아직 남은 운영 기록이 없어요.</p>;
  }
  return (
    <ol className="space-y-2">
      {audits.map((audit, index) => (
        // 감사 로그는 append-only(재정렬 없음)라 index 를 키에 섞어 동일 시각·동일 액션 충돌만 방지한다.
        <li
          key={`${audit.action}-${audit.createdAt}-${index}`}
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink-deep">{AUDIT_ACTION_LABELS[audit.action]}</span>
            <span className="text-charcoal-2">{audit.adminName ?? '(탈퇴한 관리자)'}</span>
            <span className="ml-auto font-mono text-xs text-charcoal-3">{formatAuditTime(audit.createdAt)}</span>
          </div>
          {audit.detail !== null && audit.detail.trim() !== '' && (
            <p className="mt-1 text-xs text-charcoal-3">{audit.detail}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
