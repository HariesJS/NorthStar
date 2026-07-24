import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NorthStar — трекер релизов в Google Play',
  description: 'Отслеживание выхода приложений в Google Play',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
