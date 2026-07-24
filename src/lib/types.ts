export type AppStatus =
  | 'unknown' // ещё ни разу не проверяли
  | 'not_published' // 404, и опубликованным мы его никогда не видели
  | 'pre_registration' // страница есть, но идёт предрегистрация
  | 'published' // вышло
  | 'removed'; // 404 после того, как мы видели его опубликованным — удаление/бан

export type EventType =
  | 'added'
  | 'published'
  | 'updated'
  | 'removed'
  | 'restored'
  | 'pre_registration'
  | 'error';

export interface TrackedApp {
  package_id: string;
  title: string | null;
  developer: string | null;
  icon_url: string | null;
  status: AppStatus;
  store_updated_on: string | null;
  published_at: string | null;
  removed_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  seen_new: number;
  country: string;
  created_at: string;
  /** 1, если приложение оказалось уже опубликовано на самой первой проверке —
   *  тогда published_at пуст, т.к. настоящую дату релиза Google Play не отдаёт. */
  published_before_tracking: number;
}

export interface AppEvent {
  id: number;
  package_id: string;
  type: EventType;
  from_status: AppStatus | null;
  to_status: AppStatus | null;
  detail: string | null;
  created_at: string;
}

export const STATUS_LABELS: Record<AppStatus, string> = {
  unknown: 'ещё не проверяли',
  not_published: 'не опубликовано',
  pre_registration: 'предрегистрация',
  published: 'вышло',
  removed: 'удалено из стора',
};

export const EVENT_LABELS: Record<EventType, string> = {
  added: 'добавлено в отслеживание',
  published: 'приложение вышло',
  updated: 'обновилось в сторе',
  removed: 'удалено из стора',
  restored: 'вернулось в стор',
  pre_registration: 'открыта предрегистрация',
  error: 'ошибка проверки',
};
