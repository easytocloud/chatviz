import { createContext, useContext } from 'react';

export interface Theme {
  bgBase: string;
  bgPanel: string;
  bgSurface: string;
  bgSunken: string;
  bgBubble: string;
  bgSelectedLeft: string;
  bgSelectedRight: string;
  bgAmber: string;
  bgAmberHeader: string;
  border: string;
  borderMid: string;
  textPrimary: string;
  textBright: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;
  textDimmer: string;
  textGhost: string;
  // Hex alpha suffixes appended to semantic colors (e.g. MESSAGE_COLORS.system + tintBg)
  tintBg: string;
  tintBorder: string;
  isDark: boolean;
}

export const darkTheme: Theme = {
  bgBase:          '#0F172A',
  bgPanel:         '#0B1120',
  bgSurface:       '#111827',
  bgSunken:        '#0D0D0D',
  bgBubble:        '#111827',
  bgSelectedLeft:  '#1E293B',
  bgSelectedRight: '#0F2A1F',
  bgAmber:         '#0D0A00',
  bgAmberHeader:   '#1C1205',
  border:          '#1F2937',
  borderMid:       '#374151',
  textPrimary:     '#E5E7EB',
  textBright:      '#F9FAFB',
  textSecondary:   '#CBD5E1',
  textMuted:       '#9CA3AF',
  textDim:         '#6B7280',
  textDimmer:      '#4B5563',
  textGhost:       '#374151',
  tintBg:          '0D',
  tintBorder:      '33',
  isDark:          true,
};

export const lightTheme: Theme = {
  bgBase:          '#F1F5F9',
  bgPanel:         '#FFFFFF',
  bgSurface:       '#F8FAFC',
  bgSunken:        '#F0F4F8',
  bgBubble:        '#FFFFFF',
  bgSelectedLeft:  '#DBEAFE',
  bgSelectedRight: '#DCFCE7',
  bgAmber:         '#FFFBEB',
  bgAmberHeader:   '#FEF3C7',
  border:          '#E2E8F0',
  borderMid:       '#CBD5E1',
  textPrimary:     '#1E293B',
  textBright:      '#0F172A',
  textSecondary:   '#334155',
  textMuted:       '#475569',
  textDim:         '#64748B',
  textDimmer:      '#94A3B8',
  textGhost:       '#E2E8F0',
  tintBg:          '22',
  tintBorder:      '66',
  isDark:          false,
};

export const ThemeContext = createContext<Theme>(darkTheme);
export const useTheme = () => useContext(ThemeContext);
