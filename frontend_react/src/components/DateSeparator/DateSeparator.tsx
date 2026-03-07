import React from 'react';
import { format, isToday, isYesterday, isSameYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTheme } from '../../contexts/ThemeContext';

interface DateSeparatorProps {
  date: string | Date;
}

const DateSeparator: React.FC<DateSeparatorProps> = ({ date }) => {
  const { colors } = useTheme();

  const formatDate = (date: string | Date): string => {
    const d = typeof date === 'string' ? new Date(date) : date;

    if (isToday(d)) {
      return 'HOJE';
    }

    if (isYesterday(d)) {
      return 'ONTEM';
    }

    if (isSameYear(d, new Date())) {
      return format(d, "d 'de' MMMM", { locale: ptBR }).toUpperCase();
    }

    return format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR }).toUpperCase();
  };

  return (
    <div className="flex items-center justify-center my-4">
      <div
        className="px-4 py-1.5 rounded-md shadow-sm"
        style={{
          backgroundColor: colors.headerBg,
          border: `1px solid ${colors.border}`,
        }}
      >
        <span
          className="text-[12.5px] font-medium"
          style={{ color: colors.textSecondary }}
        >
          {formatDate(date)}
        </span>
      </div>
    </div>
  );
};

export default DateSeparator;
