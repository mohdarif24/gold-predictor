import type { Metadata, Viewport } from "next";
import { Manrope, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const bengali = Noto_Sans_Bengali({ variable: "--font-bengali", subsets: ["bengali"] });

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Gold Predictor";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Plain-language gold price signals with honest testing.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${bengali.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
