import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ミッションしりとり",
  description: "毎日変わるミッションを攻略する、ひとりしりとり。"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
