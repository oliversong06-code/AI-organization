import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "@/components/layout/AppSidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI 회사 운영 웹앱",
  description: "로컬 전용 AI 회사 운영 대시보드 — 사무실 시각화, 승인함, 업무/자동화 관리",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <div className="flex min-h-full flex-1">
            <AppSidebar />
            <div className="flex min-h-full flex-1 flex-col">{children}</div>
          </div>
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
