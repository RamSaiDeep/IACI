import type { Metadata } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import "./globals.css";
import Footer from "../components/Footer";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Indian Actuaries Climate Index",
  description: "Indian Actuaries Climate Index (IACI) Web Application",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Pages fill the column with flex-1 so the footer sits below the content
          on short pages instead of floating mid-screen. */}
      <body className="min-h-full flex flex-col bg-background">
        {children}
        <Footer />
      </body>
    </html>
  );
}
