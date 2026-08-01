import "./globals.css";
import { sans, mono } from "./fonts";
import { Providers } from "@/components/providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The font variables belong on <html>, not on a wrapper element: Headless UI
    // renders dialogs and popovers into a portal on <body>, which would otherwise
    // fall back to system-ui.
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
