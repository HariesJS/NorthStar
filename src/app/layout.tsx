import type { Metadata } from 'next';
import Script from 'next/script';
import { TelegramInit } from '@/components/TelegramInit';
import './globals.css';

export const metadata: Metadata = {
  title: 'North Star — трекер релизов в Google Play',
  description: 'Отслеживание выхода приложений в Google Play',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // telegram-web-app.js выставляет на <html> инлайн-переменные вьюпорта
    // (--tg-viewport-height и т.п.) ещё до гидратации React — это ожидаемо,
    // поэтому подавляем предупреждение о расхождении именно на этом узле.
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* SDK Telegram Mini App. beforeInteractive — чтобы window.Telegram
            существовал к моменту инициализации в TelegramInit. */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="min-h-screen antialiased">
        <TelegramInit />
        {children}
      </body>
    </html>
  );
}
