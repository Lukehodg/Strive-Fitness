// React Native theme configuration
// This theme is designed to match the web application's theme as closely as possible

// Define type for the theme
export interface ThemeType {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    border: string;
    notification: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    muted: string;
    accent: string;
    // Workout-specific colors
    strength: string;
    endurance: string;
    flexibility: string;
    recovery: string;
    // Stat-specific colors
    protein: string;
    carbs: string;
    fat: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  fontWeight: {
    thin: string;
    light: string;
    normal: string;
    medium: string;
    semibold: string;
    bold: string;
    extrabold: string;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: number;
  };
  shadows: {
    sm: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
    md: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
    lg: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
  };
}

// Theme object
export const theme: ThemeType = {
  colors: {
    // Core colors
    primary: '#3B82F6', // Blue-500
    secondary: '#6366F1', // Indigo-500
    background: '#111827', // Gray-900
    card: '#1F2937', // Gray-800
    text: '#F9FAFB', // Gray-50
    textSecondary: '#9CA3AF', // Gray-400
    border: '#374151', // Gray-700
    notification: '#F43F5E', // Red-500
    success: '#10B981', // Green-500
    warning: '#F59E0B', // Amber-500
    error: '#EF4444', // Red-500
    info: '#3B82F6', // Blue-500
    muted: '#6B7280', // Gray-500
    accent: '#8B5CF6', // Violet-500

    // Workout-specific colors
    strength: '#3B82F6', // Blue-500
    endurance: '#8B5CF6', // Violet-500
    flexibility: '#10B981', // Green-500
    recovery: '#F59E0B', // Amber-500

    // Stat-specific colors
    protein: '#3B82F6', // Blue-500
    carbs: '#10B981', // Green-500
    fat: '#F59E0B', // Amber-500
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
  },
  fontWeight: {
    thin: '200',
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.18,
      shadowRadius: 1.0,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.34,
      shadowRadius: 6.27,
      elevation: 10,
    },
  },
};

export default theme;