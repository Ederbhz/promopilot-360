import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PromoPilot 360",
  description: "Garimpo inteligente de ofertas no piloto automatico."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
