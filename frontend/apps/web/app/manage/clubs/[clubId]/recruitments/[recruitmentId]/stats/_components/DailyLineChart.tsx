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
      <p className="py-10 text-center text-sm text-slate-400">
        일자별 데이터가 없습니다.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={dailyPoints} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          width={30}
        />
        <Tooltip
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            fontSize: '12px',
          }}
          labelFormatter={(label) => `날짜: ${label}`}
          formatter={(value) => [value, '지원 수']}
        />
        <Line
          type="monotone"
          dataKey="submittedCount"
          stroke="#059669"
          strokeWidth={2}
          dot={{ r: 3, fill: '#059669' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}