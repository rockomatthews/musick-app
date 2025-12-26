import type { Metadata } from "next";
import "./globals.css";
import ThemeRegistry from "./theme-registry";

export const metadata: Metadata = {
  title: "Music-Land",
  description: "Browser-first music playground: stems, effects, recording, collaboration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
