import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tagebuch",
  description:
    "Ein ruhiges Tagebuch für Gedanken und Gefühle. Funktioniert offline und gleicht sich mit deiner Datenbank ab.",
  applicationName: "Tagebuch",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Tagebuch",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#e9ecf4",
};

/* Läuft vor dem ersten Paint: verhindert das Aufblitzen des falschen Themes. */
const themeBootstrap = `(function(){try{
var p=localStorage.getItem('tb:theme')||'system';
var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
var r=document.documentElement;r.dataset.theme=d?'dark':'light';
var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'#0a0c11':'#e9ecf4');
var a=localStorage.getItem('tb:accent');if(a)r.style.setProperty('--accent',a);
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" data-theme="light" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        {children}
      </body>
    </html>
  );
}
