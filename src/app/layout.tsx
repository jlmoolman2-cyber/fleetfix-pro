import type { Metadata } from "next";
import AuthGate from "./components/AuthGate";
import EnterKeyNavigation from "./components/EnterKeyNavigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "FleetFix",
  description: "FleetFix service management interface",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="h-full"
    >
      <body className="h-full overflow-hidden bg-slate-100 text-slate-900">
        <EnterKeyNavigation />
        <div className="flex h-screen overflow-hidden">
          <AuthGate>{children}</AuthGate>
        </div>
      </body>
    </html>
  );
}
