import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#071b3a",
        leaf: "#075ddc",
        amber: "#ffc400",
        saffron: "#ff6a00",
        coral: "#e94b1c",
        mist: "#eef5ff"
      },
      boxShadow: {
        soft: "0 18px 40px rgba(7, 27, 58, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
