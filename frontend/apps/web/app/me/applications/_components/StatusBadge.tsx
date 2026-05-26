/* a-apply-status.jsx → TypeScript 변환: StatusBadge */

import { STATUS_META } from '../_constants/data';
import type { AppStatus } from '../_constants/data';

type Props = {
  status: AppStatus;
};

export const StatusBadge = ({ status }: Props) => {
  const meta = STATUS_META[status];
  if (!meta) return null;
  return (
    <span style={{
      display: 'inline-block',
      padding: '5px 12px',
      borderRadius: 999,
      background: meta.bg,
      color: meta.textColor,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: '-0.005em',
      whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  );
};
