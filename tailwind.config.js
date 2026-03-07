/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    // Override default colors to enforce strict monochrome palette
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#FFFFFF',
      black: '#000000',
      
      // Semantic mappings
      // Backgrounds
      'app-bg': '#F5F5F7',
      
      // Re-map standard Tailwind palettes to the requested monochrome scheme
      slate: {
        50: '#F5F5F7',   // App Background
        100: '#F5F5F7',  // Very subtle borders/bg
        200: '#E5E5EA',  // Borders
        300: '#D1D1D6',  // Disabled/Placeholder
        400: '#8E8E93',  // Secondary Text
        500: '#8E8E93',  // Secondary Text
        600: '#1C1C1E',  // Dark Gray
        700: '#1C1C1E',  // Accent Blocks
        800: '#000000',  // Primary Text
        900: '#000000',  // Primary Text
        950: '#000000',
      },
      gray: {
        50: '#F5F5F7',
        100: '#F5F5F7',
        200: '#E5E5EA',
        300: '#D1D1D6',
        400: '#8E8E93',
        500: '#8E8E93',
        600: '#1C1C1E',
        700: '#1C1C1E',
        800: '#000000',
        900: '#000000',
        950: '#000000',
      },
      zinc: {
        50: '#F5F5F7',
        100: '#F5F5F7',
        200: '#E5E5EA',
        300: '#D1D1D6',
        400: '#8E8E93',
        500: '#8E8E93',
        600: '#1C1C1E',
        700: '#1C1C1E',
        800: '#000000',
        900: '#000000',
        950: '#000000',
      },
      neutral: {
        50: '#F5F5F7',
        100: '#F5F5F7',
        200: '#E5E5EA',
        300: '#D1D1D6',
        400: '#8E8E93',
        500: '#8E8E93',
        600: '#1C1C1E',
        700: '#1C1C1E',
        800: '#000000',
        900: '#000000',
        950: '#000000',
      },
      stone: {
        50: '#F5F5F7',
        100: '#F5F5F7',
        200: '#E5E5EA',
        300: '#D1D1D6',
        400: '#8E8E93',
        500: '#8E8E93',
        600: '#1C1C1E',
        700: '#1C1C1E',
        800: '#000000',
        900: '#000000',
        950: '#000000',
      },
      // Map all colorful palettes to monochrome
      indigo: {
        50: '#F5F5F7',
        100: '#F5F5F7',
        200: '#E5E5EA',
        300: '#8E8E93',
        400: '#8E8E93',
        500: '#000000', // Primary Action -> Black
        600: '#000000',
        700: '#1C1C1E',
        800: '#1C1C1E',
        900: '#000000',
      },
      orange: {
        50: '#F5F5F7',
        100: '#F5F5F7',
        200: '#E5E5EA',
        300: '#8E8E93',
        400: '#8E8E93',
        500: '#000000',
        600: '#000000',
      },
      emerald: {
        50: '#F5F5F7',
        100: '#F5F5F7',
        200: '#E5E5EA',
        500: '#000000',
        600: '#000000',
      },
      red: {
        50: '#F5F5F7',
        100: '#F5F5F7',
        200: '#E5E5EA',
        300: '#8E8E93',
        400: '#8E8E93',
        500: '#000000',
        600: '#000000',
        800: '#000000',
      },
      yellow: {
         300: '#8E8E93',
         400: '#8E8E93',
         500: '#000000',
      },
      blue: {
         500: '#000000',
         600: '#000000',
      },
      green: {
         500: '#000000',
         600: '#000000',
      },
      purple: {
         500: '#000000',
      },
      pink: {
         500: '#000000',
      },
      rose: {
         500: '#000000',
      },
      cyan: {
         500: '#000000',
      },
      teal: {
         500: '#000000',
      },
      sky: {
         500: '#000000',
      },
      lime: {
         500: '#000000',
      },
      amber: {
         100: '#F5F5F7',
         500: '#000000',
      },
      violet: {
         500: '#000000',
      },
      fuchsia: {
         500: '#000000',
      },
    },
    extend: {
      // Remove all shadows
      boxShadow: {
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        inner: 'none',
        none: 'none',
      },
      dropShadow: {
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        none: 'none',
      },
      // Remove gradients
      backgroundImage: {
        'gradient-to-t': 'none',
        'gradient-to-b': 'none',
        'gradient-to-r': 'none',
        'gradient-to-l': 'none',
        'gradient-to-tr': 'none',
        'gradient-to-tl': 'none',
        'gradient-to-br': 'none',
        'gradient-to-bl': 'none',
      }
    },
  },
  plugins: [],
}
