import { requestJson } from "@/features/auth/services/auth-api";
import { connectSocket, getSocket } from "@/features/messaging/services/socket-service";
import { notificationDebug } from "@/lib/notifications/notification-debug";

async function registerViaSocket(fcmToken: string): Promise<boolean> {
  try {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit("call:update-fcm-token", { fcmToken });
      notificationDebug.info("Register", "token sent via socket");
      return true;
    }
    const connected = await connectSocket();
    if (connected?.connected) {
      connected.emit("call:update-fcm-token", { fcmToken });
      notificationDebug.info("Register", "token sent via socket after connect");
      return true;
    }
  } catch {
    // Socket is optional — REST is preferred.
  }
  return false;
}

/**
 * Persist FCM token on the server (REST + socket fallback).
 */
export async function registerFCMTokenWithServer(fcmToken: string): Promise<boolean> {
  if (!fcmToken) return false;

  try {
    await requestJson<{ success: boolean }>("/api/notifications/fcm-token", {
      method: "POST",
      body: JSON.stringify({ fcmToken }),
    });
    notificationDebug.info("Register", "token saved on server (REST)");
    return true;
  } catch (error) {
    notificationDebug.warn("Register", "REST token register failed, trying socket", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return registerViaSocket(fcmToken);
}

/**
 * Clear the FCM token from the server so no further pushes can be delivered.
 */
export async function unregisterFCMTokenFromServer(): Promise<boolean> {
  try {
    await requestJson<{ success: boolean }>("/api/notifications/fcm-token", {
      method: "DELETE",
    });
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.info("[FCM] Token cleared on server");
    }
    return true;
  } catch (error) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn("[FCM] Token clear failed:", error);
    }
    return false;
  }
}
