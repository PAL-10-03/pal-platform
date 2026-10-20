import "./globals.css";
import type { ReactNode } from "react";


export const metadata = {
  title: "PAL Business Solutions",
  description: "PAL Business Solutions workspace"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    
      <html lang="en">
        <body>{children}</body>
      </html>
   
  );
}
