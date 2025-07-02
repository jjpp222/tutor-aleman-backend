import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tutor Virtual de Alemán",
  description: "Aprende alemán con IA - Niveles B1-B2",
  keywords: ["alemán", "tutor", "IA", "idiomas", "aprendizaje"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} antialiased`}>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
