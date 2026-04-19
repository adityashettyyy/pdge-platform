export default {
  content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: { mono: ["'JetBrains Mono'","monospace"], sans: ["'DM Sans'","sans-serif"] },
      colors: {
        void: "#04060A", surface: "#0A0E17", panel: "#0F1520", border: "#1A2332",
        accent: "#00FFB2", warn: "#FF6B2B", danger: "#FF3366", info: "#3B8BFF",
      },
      animation: { "pulse-slow": "pulse 3s ease-in-out infinite", "scan": "scan 3s linear infinite" },
      keyframes: { scan: { "0%": { top: "0%" }, "100%": { top: "100%" } } }
    }
  },
  plugins: []
};
