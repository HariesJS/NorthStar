# NorthStar

Трекер релизов приложений в Google Play. Вставляете ссылки на ещё не вышедшие
приложения — сайт раз в 15 минут проверяет каждое и подсвечивает вышедшие.

Стек: Next.js (App Router) + Postgres. Проверки по расписанию дёргает внешний
cron (GitHub Actions), потому что serverless-функции Vercel не держат фоновых
таймеров.

## Локальный запуск

Нужен Postgres. Создайте базу и пропишите строку подключения:

```bash
cp .env.example .env.local
# отредактируйте DATABASE_URL под свою базу
npm install
npm run dev
```

Открыть http://localhost:3000. Схема создаётся автоматически при первом запросе.

## Как определяется статус

Публичного API у Play Store нет, поэтому читается HTML страницы приложения
(`?id=<package>&hl=en&gl=US`):

| Ответ Play Store | Статус |
|---|---|
| `404` | `not_published` — не опубликовано |
| `404` после того, как мы видели приложение живым | `removed` — удалено/забанено |
| `200` + «Pre-register» / `PreOrder` | `pre_registration` — релиза ещё нет |
| `200` | `published` — вышло |
| `429` / `5xx` / сеть | статус **не меняется**, пишется только `last_error` |

`hl=en` обязателен: дата «Updated on» ищется по тексту подписи.

Название, разработчик и иконка берутся из `ld+json` на странице — заполнять
карточки руками не нужно.

Google Play не отдаёт настоящую дату первого релиза. Если приложение уже было
опубликовано на самой первой проверке, точная дата выхода неизвестна — она не
выдумывается, а помечается флагом `published_before_tracking`.

## Что где

| Файл | Назначение |
|---|---|
| `src/lib/playstore.ts` | запрос к Play Store и классификация ответа |
| `src/lib/checker.ts` | правила переходов статусов, запись событий |
| `src/lib/repo.ts` | чтение/запись приложений, сортировка списка |
| `src/lib/db.ts` | пул соединений Postgres и миграция схемы |
| `src/app/api/check/route.ts` | полный обход; сюда стучится cron |
| `.github/workflows/check.yml` | GitHub Actions: вызывает `/api/check` каждые 15 минут |
| `src/components/Dashboard.tsx` | список, фильтры, автообновление раз в минуту |

## Деплой на Vercel

1. **Импортировать репозиторий** в Vercel (New Project → выбрать `NorthStar`).
2. **Создать базу**: вкладка Storage → Create Database → Postgres. Vercel сам
   пропишет `POSTGRES_URL` в переменные окружения проекта.
3. **Задать секрет** `NORTHSTAR_CHECK_TOKEN` (любая длинная случайная строка) в
   Settings → Environment Variables. Он защищает `/api/check` от посторонних.
4. **Задеплоить.** Сайт откроется на `*.vercel.app`, схема БД создастся сама.
5. **Настроить cron** в GitHub (Settings → Secrets and variables → Actions):
   - `NORTHSTAR_CHECK_URL` = `https://<ваш-домен>.vercel.app/api/check`
   - `NORTHSTAR_CHECK_TOKEN` = то же значение, что в Vercel

   Workflow `.github/workflows/check.yml` уже в репозитории — он будет вызывать
   проверку каждые 15 минут. Запустить вручную для теста: вкладка Actions →
   «Проверка релизов» → Run workflow.

> Vercel Hobby разрешает собственный cron не чаще раза в сутки, поэтому
> расписание держим в GitHub Actions — там ограничений на частоту нет.

## Переменные окружения

| Переменная | Где | Назначение |
|---|---|---|
| `POSTGRES_URL` | Vercel (авто) | строка подключения к Postgres |
| `DATABASE_URL` | локально | то же для локального Postgres |
| `NORTHSTAR_CHECK_TOKEN` | Vercel + GitHub | защищает `/api/check`; если пусто — проверка открыта всем |
| `NORTHSTAR_CHECK_URL` | GitHub | адрес `/api/check` на задеплоенном сайте |

## Переезд на обычный сервер (VPS / Railway / Fly)

Код одинаков — нужен только доступный Postgres в `DATABASE_URL`. Cron можно
оставить на GitHub Actions или заменить системным `cron`, дёргающим `/api/check`.
