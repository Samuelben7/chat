import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { BsSun, BsMoon } from 'react-icons/bs';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300"
      style={{
        backgroundColor: theme === 'whatsapp' ? '#E9EDEF' : '#1a1f3a',
        color: theme === 'whatsapp' ? '#3B4A54' : '#00d4ff',
        border: `1px solid ${theme === 'whatsapp' ? '#E9EDEF' : '#2a2f4a'}`,
      }}
      title={theme === 'whatsapp' ? 'Mudar para tema YourSystem' : 'Mudar para tema WhatsApp'}
    >
      {theme === 'whatsapp' ? (
        <>
          <BsMoon size={18} />
          <span className="text-sm font-medium hidden md:inline">YourSystem</span>
        </>
      ) : (
        <>
          <BsSun size={18} />
          <span className="text-sm font-medium hidden md:inline">WhatsApp</span>
        </>
      )}
    </button>
  );
};

export default ThemeToggle;
