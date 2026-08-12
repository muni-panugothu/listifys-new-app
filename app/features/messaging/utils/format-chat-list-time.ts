import { formatRelativeTime } from "@/lib/format-relative-time";

/** Inbox row timestamp — relative style like Instagram / WhatsApp. */
export function formatChatListTime(dateStr: string): string {
  return formatRelativeTime(dateStr);
}
