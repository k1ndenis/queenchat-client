export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 
          '"Noto Color Emoji"', '"Apple Color Emoji"', '"Segoe UI Emoji"', 
          '"Android Emoji"', '"Twemoji Mozilla"', 'sans-serif'],
        'emoji': ['"Noto Color Emoji"', '"Apple Color Emoji"', '"Segoe UI Emoji"', 
          '"Android Emoji"', '"Twemoji Mozilla"', 'sans-serif'],
      },
      keyframes: {
        'zoom-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'zoom-in-95': 'zoom-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}