import "./globals.css"; // 👈 importa estilos globais
import type { Metadata } from "next";
import { Sidebar } from "@/components/layout";

export const metadata: Metadata = {
  title: "Financeiro",
  description: "App Financeiro",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="main-layout">
          <Sidebar />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
