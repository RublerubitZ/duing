'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import type { StatsFunnel } from '@duing/types';

type FunnelChartProps = {
  funnelData: StatsFunnel;
};

type FunnelStage = {
  name: string;
  value: number;
  color: string;
};

const STAGE_COLORS: [string, string, string] = ['#475569', '#0369a1', '#16a34a'];

export function FunnelChart({ funnelData }: FunnelChartProps) {
  const allStages: FunnelStage[] = [
    { name: '제출', value: funnelData.submitted, color: STAGE_COLORS[0] },
    ...(funnelData.interviewEntered !== null
      ? [{ name: '면접 진입', value: funnelData.interviewEntered, color: STAGE_COLORS[1] }]
      : []),
    { name: '합격', value: funnelData.accepted, color: STAGE_COLORS[2] },
  ];

  const maxValue = Math.max(...allStages.map((stage) => stage.value), 1);

  return (
    <div className="space-y-2">
      {funnelData.interviewEntered === null && (
        <p className="text-xs text-slate-400">면접 없는 모집 — 2단계 표시</p>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={allStages}
          layout="vertical"
          margin={{ top: 4, right: 40, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis
            type="number"
            domain={[0, maxValue]}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12, fill: '#475569' }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '12px',
            }}
            formatter={(value) => [value, '인원']}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={32}>
            {allStages.map((stage, index) => (
              <Cell key={stage.name} fill={stage.color} opacity={1 - index * 0.08} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}