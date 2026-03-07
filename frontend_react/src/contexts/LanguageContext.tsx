import React, { createContext, useContext, useState } from 'react';

type Lang = 'pt' | 'en';

interface LanguageContextType {
  lang: Lang;
  toggleLang: () => void;
  t: (pt: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'pt',
  toggleLang: () => {},
  t: (pt: string) => pt,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem('app_lang') as Lang) || 'pt';
  });

  const toggleLang = () => {
    setLang(prev => {
      const next = prev === 'pt' ? 'en' : 'pt';
      localStorage.setItem('app_lang', next);
      return next;
    });
  };

  const t = (pt: string, en: string) => lang === 'en' ? en : pt;

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

// Small toggle button component
export const LangToggle: React.FC = () => {
  const { lang, toggleLang } = useLanguage();

  return (
    <button
      onClick={toggleLang}
      title={lang === 'pt' ? 'Switch to English' : 'Mudar para Português'}
      style={{
        padding: '3px 8px',
        borderRadius: 6,
        border: '1px solid rgba(128,128,128,0.3)',
        background: 'rgba(128,128,128,0.1)',
        color: '#888',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        letterSpacing: 0.5,
      }}
    >
      {lang === 'pt' ? 'EN' : 'PT'}
    </button>
  );
};
