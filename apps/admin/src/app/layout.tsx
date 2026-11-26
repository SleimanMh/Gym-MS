import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getT } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = { title: "Gym Manager" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { lang, dir } = await getT();
  return (
    <html lang={lang} dir={dir}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
