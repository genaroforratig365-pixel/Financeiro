import "./globals.css"; // 👈 importa estilos globais
import type { Metadata } from "next";
import { Sidebar } from "@/components/layout";
import { RequireUser } from "@/components/layout/RequireUser";

export const metadata: Metadata = {
  title: "Financeiro",
  description: "App Financeiro",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="main-layout">
          <RequireUser />
          <Sidebar />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
