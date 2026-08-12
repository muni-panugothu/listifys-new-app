import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";

import {
  connectSocket,
  getSocket,
} from "@/features/messaging/services/socket-service";

type Listener = (ids: Set<string>) => void;

let globalOnlineIds = new Set<string>();
const listeners = new Set<Listener>();
let socketSubscribed = false;

function notifyListeners() {
  for (const listener of listeners) {
    listener(new Set(globalOnlineIds));
  }
}

function ensurePresenceSubscription() {
  if (socketSubscribed) return;
  socketSubscribed = true;

  void connectSocket()
    .then((socket) => {
      const onOnlineList = (ids: string[]) => {
        globalOnlineIds = new Set(Array.isArray(ids) ? ids.map(String) : []);
        notifyListeners();
      };

      const onUserOnline = ({ userId }: { userId: string }) => {
        if (!userId) return;
        globalOnlineIds.add(String(userId));
        notifyListeners();
      };

      const onUserOffline = ({ userId }: { userId: string }) => {
        if (!userId) return;
        globalOnlineIds.delete(String(userId));
        notifyListeners();
      };

      socket.on("users:online", onOnlineList);
      socket.on("user:online", onUserOnline);
      socket.on("user:offline", onUserOffline);
      socket.on("connect", () => socket.emit("users:online"));
      socket.emit("users:online");
    })
    .catch(() => {});
}

/** Shared online presence — used on Messages, Profile, and chat headers. */
export function useOnlinePresence() {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(globalOnlineIds);
  const [selfConnected, setSelfConnected] = useState(getSocket()?.connected ?? false);

  useEffect(() => {
    ensurePresenceSubscription();

    const listener: Listener = (ids) => setOnlineIds(ids);
    listeners.add(listener);
    setOnlineIds(new Set(globalOnlineIds));

    const socket = getSocket();
    const onConnect = () => {
      setSelfConnected(true);
      socket?.emit("users:online");
    };
    const onDisconnect = () => setSelfConnected(false);

    socket?.on("connect", onConnect);
    socket?.on("disconnect", onDisconnect);
    setSelfConnected(socket?.connected ?? false);

    return () => {
      listeners.delete(listener);
      socket?.off("connect", onConnect);
      socket?.off("disconnect", onDisconnect);
    };
  }, []);

  const isUserOnline = useCallback(
    (userId?: string | null) => {
      if (!userId) return false;
      return onlineIds.has(String(userId));
    },
    [onlineIds],
  );

  const refreshOnlineUsers = useCallback(() => {
    getSocket()?.emit("users:online");
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshOnlineUsers();
    }, [refreshOnlineUsers]),
  );

  return {
    isUserOnline,
    isSelfOnline: selfConnected,
    refreshOnlineUsers,
  };
}
