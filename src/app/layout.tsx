import type { Metadata } from "next";
import "./globals.css";
import ThemeRegistry from "./theme-registry";

export const metadata: Metadata = {
  metadataBase: new URL("https://musick.studio"),
  title: {
    default: "Musick.Studio- play together",
    template: "%s | Musick.Studio- play together",
  },
  description: "Play together in the browser: stems, effects, AI ideas, and recording.",
  openGraph: {
    title: "Musick.Studio- play together",
    description: "Play together in the browser: stems, effects, AI ideas, and recording.",
    type: "website",
    url: "/",
    images: [
      {
        url: "/musick%20studio.png",
        width: 1024,
        height: 1024,
        alt: "Musick.Studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Musick.Studio- play together",
    description: "Play together in the browser: stems, effects, AI ideas, and recording.",
    images: ["/musick%20studio.png"],
  },
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
