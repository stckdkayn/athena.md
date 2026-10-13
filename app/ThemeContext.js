import React, { createContext, useState, useContext } from 'react';

// Nossas paletas minimalistas (P&B puro)
const themes = {
  light: {
    background: '#FFFFFF',
    surface: '#F7F7F7', // Para cartões de questões
    text: '#2F3437',    // Chumbo escuro (não cansa a vista igual preto 100%)
    border: '#EAEAEA',
  },
  dark: {
    background: '#191919', // Quase preto, excelente para leitura noturna
    surface: '#252525',
    text: '#EBEBEB',
    border: '#333333',
  }
};

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(true); // Inicia no Dark Mode
  
  // A cor que vai dar vida ao app (Heatmap, anéis, botões primários)
  // Pode ser o seu amarelo (#F5CA65) ou o azul clínico (#2D6CDF)
  const [accentColor, setAccentColor] = useState('#F5CA65'); 

  const theme = isDark ? themes.dark : themes.light;

  const toggleTheme = () => setIsDark(!isDark);

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook customizado para facilitar o uso nas telas
export const useTheme = () => useContext(ThemeContext);