/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'whatsapp-green': '#25D366',
        'whatsapp-dark': '#075E54',
        'whatsapp-light': '#DCF8C6',
        'whatsapp-bg': '#ECE5DD',
        'whatsapp-gray': '#F0F2F5',
      },
    },
  },
  plugins: [],
}
