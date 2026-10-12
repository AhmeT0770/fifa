import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "FIFA Maç Simülatörü",
  description: "FIFA 14 ve FIFA 15 Ultimate Team kadro simülasyonu",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${geist.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-gray-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
