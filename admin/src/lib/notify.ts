import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/api/client';

export function notifySuccess(message: string, title?: string): void {
  notifications.show({ color: 'teal', title, message, autoClose: 4000 });
}

/** Toast with the backend's error `message`. */
export function notifyError(err: unknown, title?: string): void {
  notifications.show({ color: 'red', title: title ?? 'Error', message: errorMessage(err), autoClose: 8000 });
}
