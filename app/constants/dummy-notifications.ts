import type { NotificationItem } from "@/features/auth/services/auth-api";

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3600000).toISOString();
const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString();

export const DUMMY_NOTIFICATIONS: NotificationItem[] = [
  {
    _id: "dummy-notif-1",
    type: "like",
    title: "",
    message:
      "Someone liked your listing on Listifys. Check it out and chat with them!",
    read: false,
    createdAt: hoursAgo(2),
  },
  {
    _id: "dummy-notif-2",
    type: "category",
    title: "",
    message:
      "🎯 New category alert! We've added Electronics to Listifys – explore top picks now",
    read: false,
    createdAt: hoursAgo(5),
  },
  {
    _id: "dummy-notif-3",
    type: "welcome",
    title: "",
    message:
      "Welcome to Listifys! 🎉 Start listing, browsing, and connecting today",
    read: true,
    createdAt: daysAgo(3),
  },
  {
    _id: "dummy-notif-4",
    type: "location",
    title: "",
    message:
      "Listifys alert: A new listing just appeared near you – tap to view and connect",
    read: true,
    createdAt: daysAgo(5),
  },
];

export function mergeNotificationsWithDummy(
  api: NotificationItem[],
): NotificationItem[] {
  const seen = new Set(api.map((n) => n._id));
  const merged = [...api];
  for (const dummy of DUMMY_NOTIFICATIONS) {
    if (!seen.has(dummy._id)) merged.push(dummy);
  }
  return merged.length > 0 ? merged : DUMMY_NOTIFICATIONS;
}
