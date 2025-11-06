import "./globals.css"; // 👈 importa estilos globais
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Financeiro",
  description: "App Financeiro",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
