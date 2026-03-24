import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voxel",
  description: "A new Next.js app for Augmego.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
