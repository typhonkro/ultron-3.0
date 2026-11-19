import "./globals.css";

export const metadata = { title: "ULTRON", description: "Personal AI assistant dashboard" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
