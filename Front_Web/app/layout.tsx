export const metadata = {
  title: "Financeiro",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://financeiro-germani.vercel.app"),
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br">
      <body style={{ fontFamily: "Inter, system-ui, sans-serif", margin: 24 }}>
        {children}
      </body>
    </html>
  );
}
