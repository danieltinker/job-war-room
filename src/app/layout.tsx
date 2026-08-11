import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job War Room",
  description: "Mission control for your job hunt",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
