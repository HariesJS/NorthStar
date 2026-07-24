'use client';

import { useEffect } from 'react';

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
}

/**
 * Инициализация Telegram Mini App. Если сайт открыт внутри Telegram —
 * сообщаем, что готовы, и разворачиваем на всю высоту. Вне Telegram
 * объекта нет, поэтому обычный сайт в браузере работает как прежде.
 */
export function TelegramInit() {
  useEffect(() => {
    const tg = (
      window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }
    ).Telegram?.WebApp;
    if (!tg) return;
    tg.ready();
    tg.expand();
  }, []);

  return null;
}
