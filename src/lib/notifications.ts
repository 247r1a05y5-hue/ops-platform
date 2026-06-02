/**
 * lib/notifications.ts
 * In-memory SSE client registry + createNotification() helper.
 * Import createNotification() from any server-side code to persist
 * a Notification record AND push it live to the user's open browser tab.
 */
import { connectDB, Notification } from './db';

type Controller = ReadableStreamDefaultController<string>;
const clients = new Map<string, Set<Controller>>();

export function registerSSEClient(userId: string, ctrl: Controller) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(ctrl);
}

export function unregisterSSEClient(userId: string, ctrl: Controller) {
  clients.get(userId)?.delete(ctrl);
  if (clients.get(userId)?.size === 0) clients.delete(userId);
}

function pushSSE(userId: string, data: object) {
  const set = clients.get(userId);
  if (!set) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const ctrl of set) {
    try { ctrl.enqueue(payload); } catch (_) { set.delete(ctrl); }
  }
}

export async function createNotification(userId: string, title: string, message: string) {
  await connectDB();
  const n = await Notification.create({ userId, title, message });
  pushSSE(userId, { type: 'notification', id: String(n._id), title, message, createdAt: n.createdAt });
  return n;
}
