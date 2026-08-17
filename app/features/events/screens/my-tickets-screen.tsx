import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";

import { ProfileSubScreenLayout } from "@/components/profile-sub-screen-layout";
import { ListifyFonts } from "@/constants/typography";
import { resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import {
  fetchMyTickets,
  type MyTicketItem,
} from "@/features/events/services/event-ticketing-api";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";
import { useFocusEffect } from "@react-navigation/native";

type TabId = "upcoming" | "past" | "cancelled";

const TABS: { id: TabId; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
];

export function MyTicketsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<TabId>("upcoming");
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<MyTicketItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchMyTickets(tab);
      setTickets(items);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ProfileSubScreenLayout title="My tickets">
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? colors.primary : colors.surface,
              }}
            >
              <Text
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  fontSize: 13,
                  color: active ? colors.textOnPrimary : colors.textSecondary,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 48 }}>
              <MaterialIcons name="confirmation-number" size={48} color={colors.iconMuted} />
              <Text style={{ marginTop: 12, fontFamily: ListifyFonts.medium, color: colors.textSecondary }}>
                No tickets here yet
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/event-ticket?ticketId=${item.id}` as Href)}
              style={{
                flexDirection: "row",
                gap: 12,
                padding: 12,
                marginBottom: 10,
                borderRadius: 14,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ width: 64, height: 80, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surfaceMuted }}>
                {(() => {
                  const coverUrl =
                    resolveAbsoluteMediaUrl(item.event?.image) ?? item.event?.image ?? "";
                  return coverUrl ? (
                    <Image source={{ uri: coverUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                      <MaterialIcons name="event" size={24} color={colors.iconMuted} />
                    </View>
                  );
                })()}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 15, color: colors.textPrimary }} numberOfLines={2}>
                  {item.event?.title ?? "Event"}
                </Text>
                <Text style={{ marginTop: 4, fontFamily: ListifyFonts.regular, fontSize: 12, color: colors.textSecondary }}>
                  {item.ticketTypeName} × {item.quantity}
                </Text>
                <Text style={{ marginTop: 2, fontFamily: ListifyFonts.medium, fontSize: 12, color: colors.textSecondary }}>
                  {item.bookingId} · {item.status}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.iconMuted} />
            </Pressable>
          )}
        />
      )}
    </ProfileSubScreenLayout>
  );
}
