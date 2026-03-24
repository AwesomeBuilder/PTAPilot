import type { Metadata } from "next";
import { Geist, Geist_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PTA Pilot",
  description: "AI-assisted PTA communications workflow demo with Auth0 Token Vault.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        dmSans.variable,
      )}
    >
      <body className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(80,76,255,0.12),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.94),_rgba(244,246,252,1))] text-foreground">
        {children}
      </body>
    </html>
  );
}
