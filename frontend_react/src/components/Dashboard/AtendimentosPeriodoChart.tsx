import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTheme } from '../../contexts/ThemeContext';

interface AtendimentosPeriodoData {
  periodo: string;
  total: number;
  finalizados: number;
  em_atendimento: number;
}

interface AtendimentosPeriodoChartProps {
  data: AtendimentosPeriodoData[];
  title: string;
  height?: number;
}

const AtendimentosPeriodoChart: React.FC<AtendimentosPeriodoChartProps> = ({
  data,
  title,
  height = 300
}) => {
  const { colors } = useTheme();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-3 rounded-lg shadow-lg" style={{
          backgroundColor: colors.tooltipBg,
          border: `1px solid ${colors.tooltipBorder}`
        }}>
          <p className="text-sm font-medium mb-2" style={{ color: colors.tooltipText }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <strong>{entry.value}</strong>
            </p>
          ))}
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
      <h3 className="text-lg font-semibold mb-4" style={{ color: colors.textPrimary }}>
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} />
          <XAxis
            dataKey="periodo"
            tick={{ fill: colors.textSecondary, fontSize: 12 }}
            stroke={colors.chartGrid}
          />
          <YAxis
            tick={{ fill: colors.textSecondary, fontSize: 12 }}
            stroke={colors.chartGrid}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              paddingTop: '20px',
            }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="total"
            name="Total"
            stroke={colors.chartLine1}
            strokeWidth={3}
            dot={{ fill: colors.chartLine1, r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="finalizados"
            name="Finalizados"
            stroke={colors.chartLine2}
            strokeWidth={2}
            dot={{ fill: colors.chartLine2, r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="em_atendimento"
            name="Em atendimento"
            stroke={colors.chartLine3}
            strokeWidth={2}
            dot={{ fill: colors.chartLine3, r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AtendimentosPeriodoChart;
