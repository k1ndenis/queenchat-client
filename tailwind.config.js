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
      }
    },
  },
  plugins: [],
}