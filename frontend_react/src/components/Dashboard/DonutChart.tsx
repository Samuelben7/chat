import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useTheme } from '../../contexts/ThemeContext';

interface DonutChartData {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutChartData[];
  title: string;
  centerText?: string;
  height?: number;
}

const DonutChart: React.FC<DonutChartProps> = ({
  data,
  title,
  centerText,
  height = 300
}) => {
  const { colors } = useTheme();
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const renderCustomLabel = ({ cx, cy }: any) => {
    return (
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        className="text-2xl font-bold"
        fill={colors.textPrimary}
      >
        {centerText || total}
      </text>
    );
  };

  const renderLegend = (props: any) => {
    const { payload } = props;
    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {payload.map((entry: any, index: number) => {
          const percentage = total > 0 ? ((entry.payload.value / total) * 100).toFixed(1) : 0;
          return (
            <div key={`legend-${index}`} className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm" style={{ color: colors.textSecondary }}>
                {entry.value}: <strong>{entry.payload.value}</strong> ({percentage}%)
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : 0;
      return (
        <div className="p-3 rounded-lg shadow-lg" style={{
          backgroundColor: colors.tooltipBg,
          border: `1px solid ${colors.tooltipBorder}`
        }}>
          <p className="text-sm font-medium" style={{ color: colors.tooltipText }}>{data.name}</p>
          <p className="text-lg font-bold" style={{ color: data.payload.fill }}>
            {data.value} ({percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-lg shadow-sm p-6" style={{
      backgroundColor: colors.cardBg,
      border: `1px solid ${colors.border}`
    }}>
      <h3 className="text-lg font-semibold mb-4 text-center" style={{ color: colors.textPrimary }}>
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomLabel}
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={renderLegend} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DonutChart;
