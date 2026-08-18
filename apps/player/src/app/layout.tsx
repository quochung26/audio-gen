import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Audio Truyện", template: "%s · Audio Truyện" },
  description: "Nghe truyện ngắn và truyện dài",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <PlayerProvider>
          <header className="border-b border-neutral-900">
            <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
              <Link href="/" className="font-semibold">
                Audio Truyện
              </Link>
            </div>
          </header>

          {/* pb-28: chừa chỗ cho mini-player cố định dưới đáy */}
          <main className="mx-auto max-w-3xl px-4 py-6 pb-28">{children}</main>

          <MiniPlayer />
        </PlayerProvider>
      </body>
    </html>
  );
}
