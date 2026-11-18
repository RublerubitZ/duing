'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { StatsDailyPoint } from '@duing/types';

type DailyLineChartProps = {
  dailyPoints: StatsDailyPoint[];
};

export function DailyLineChart({ dailyPoints }: DailyLineChartProps) {
  if (dailyPoints.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-charcoal-3">
        일자별 데이터가 없습니다.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={dailyPoints} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-line)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'var(--charcoal-3)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'var(--charcoal-3)' }}
          tickLine={false}
          axisLine={false}
          width={30}
        />
        <Tooltip
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid var(--gray-line)',
            fontSize: '12px',
          }}
          labelFormatter={(label) => `날짜: ${label}`}
          formatter={(value) => [value, '지원 수']}
        />
        <Line
          type="monotone"
          dataKey="submittedCount"
          stroke="var(--ink)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--ink)' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}