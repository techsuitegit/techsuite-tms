import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { DEFAULT_APP_THEME } from "@/app/shared/config/app-themes";
import { ThemeSync } from "@/app/ui/layout/theme-sync";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "tms-web",
  description: "Web-based SAP workflow approval for purchase requisitions, purchase orders, quotations, and service entries.",
};

const themeBootScript = `(function(){var def=${JSON.stringify(DEFAULT_APP_THEME)};function isAuth(p){return /^\\/(login|forgot-password)(\\/|$)/.test(p);}try{var path=location.pathname||"";if(isAuth(path)){document.documentElement.setAttribute("data-theme",def);return;}var raw=localStorage.getItem("tms-web.ui-theme");if(!raw){document.documentElement.setAttribute("data-theme",def);return;}var parsed=JSON.parse(raw);var t=parsed&&parsed.state&&parsed.state.theme;document.documentElement.setAttribute("data-theme",t||def);}catch(e){document.documentElement.setAttribute("data-theme",def);}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} h-full antialiased`} data-theme={DEFAULT_APP_THEME} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-app-screen" suppressHydrationWarning>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
