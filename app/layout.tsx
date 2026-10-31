import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "ControlSight CCM",
  description: "AI-assisted continuous control monitoring for Internal Audit (synthetic demo data)",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
