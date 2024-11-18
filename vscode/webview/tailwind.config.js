/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: {
    relative: true,
    files: ["./src/**/*.{html,ts,tsx}"],
  },
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
