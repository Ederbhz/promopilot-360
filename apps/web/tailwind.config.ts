import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        leaf: "#28756f",
        saffron: "#c98224",
        coral: "#c8503f",
        mist: "#eef3f1"
      },
      boxShadow: {
        soft: "0 18px 40px rgba(31, 41, 51, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
