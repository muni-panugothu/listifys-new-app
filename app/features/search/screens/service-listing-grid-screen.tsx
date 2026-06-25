import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useMemo, useState } from "react";
import {
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { Image } from "@/lib/nativewind-interop";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { FloatingBottomNav } from "@/components/floating-bottom-nav";

type FilterChip = {
  id: string;
  label: string;
};

type ServiceCard = {
  id: string;
  image: string;
  badge: string;
  name: string;
  reviews: string;
  rating: string;
  price: string;
  liked?: boolean;
};

const CONTAINER_PADDING = 16;
const GRID_GAP = 12;

const filterChips: FilterChip[] = [
  { id: "all", label: "All Services" },
  { id: "top-rated", label: "Top Rated" },
  { id: "available", label: "Available Now" },
  { id: "emergency", label: "Emergency" },
];

const serviceCards: ServiceCard[] = [
  {
    id: "rahul",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCvVDeAqfUnThr5rMPGkBOzccH-zYB0x2u8Llq6IMX67bVxcgfeAMeq-9xWVITCmFZvTlbsquIc2igXE46GEROxOH2mrJ0JXVqh_2-xKdHW5P0ypObGDSY32ea_-6WBJkrGC1rgXOEDbyFlpRVeRqeT9yfMCSRI6U6-89-i6J9Q0nKn_m8EEnMpwSLqcsYtxraz53LZAuKNxia_R4f_ZGzssWOuB4KnNU5Gv2-r488y7JU5kMIORSz2Dx2988VY2wdzXgWmU1T2H-E",
    badge: "Expert Plumber",
    name: "Rahul Sharma",
    reviews: "230 Reviews",
    rating: "4.9",
    price: "₹500",
  },
  {
    id: "amit",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAMClfKgWx-R5cp0hXW2YY3caff5O-4Nou8qBYQ5ay3E7nlJ_Px0Tz-63SBX9neiDWF07oxrAwxLDgcBlPzy-GLoemjdXC9vaT7Zzcqva_WO_RAVLP94O-vE0D8E5An_Z-QskUcJUsdLlkebS8A4bSHHpLKu5baRbHtnv0nRNeq1kA81nOzJBOGQnKkd1AoPD1ybaF1CzhNfhIDH2WWyWSX1OWhB9LCsoUIROmU2UjomR0XrV0flTvXbOLLc-rZHzitc8lUQF7LIro",
    badge: "Master Technician",
    name: "Amit Verma",
    reviews: "185 Reviews",
    rating: "4.8",
    price: "₹650",
  },
  {
    id: "priya",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAojdUCJ2PxDfy74Vbyrz1zJc8WZPw9nQTzVxilu0RyTaefuCHAP_sCWfVsp0LlfcXb37lMnhIK6zudAObvSX0_jkECqQAuxEeKPfPvQt-voljCycnTqKYuhrbwZVp8RzQsemlIcHN5RUZznu0SoRQe7mny9kN04Bdg-zGtqjEgRieXqU4VosW7yXb7vp52hq6fY2xJESuoGTDbv5oLBRwy7QOTkS2Txm1B6F9ew09dKEMPjAzTdqGaqzOJ06XcaZf4AEwVf5BGsk4",
    badge: "Leak Specialist",
    name: "Priya Singh",
    reviews: "98 Reviews",
    rating: "4.9",
    price: "₹450",
  },
  {
    id: "suresh",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDwfhLxZAoCQf7mjWHJNNYrVURC741ITN8EQlFxM71GBZdCUbxxSwvqxw7V6D47piXpuJaY2m5mNoeWsG3xC7DKYB3YhWligK2dH-g4DRbJTaHGetLvt3ur_V8rMPBFDFSzS-mO3fWk1fWsSlMt_h1RLWh5s0emCC4UjA0YpGLWRaXjUpm4T5KgLp1psw4F4I6Nn9qwT_bM_IW_5PhKK1JDwVoHBgk6Y_tDXXjZL2YJaziTVNDU19V80xFXxuFEdkjRtRnINL2PH8s",
    badge: "Senior Plumber",
    name: "Suresh K.",
    reviews: "312 Reviews",
    rating: "4.7",
    price: "₹750",
    liked: true,
  },
  {
    id: "vikram",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDh4d19nFO0WAnjWCXGlQvae4WF-eqr4QaJ81HistVQtv3Xi4WVuqpshQbg7CBUBDHz-SWxywXZUAy1sH8I2LGvu_H2gNkwnLGhuqhHxiE_3Rhikbviz_zFa17IIPeZN6GufjBXqKM6HrwTdPMSR5vwF_iNxB19pto_KuOav5187hU9kLkuclP1eU8s_J6NTwaXrSBteT3bbQ-IbYyxGoQIC8eroJfh_DsJHpDzeCfvlEhQoU93zR0nwNsJqhv_QtOCAJd8OEWJDsM",
    badge: "Quick Connect",
    name: "Vikram Das",
    reviews: "156 Reviews",
    rating: "4.6",
    price: "₹400",
  },
  {
    id: "elite",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBrGONhGz1_4MchM6MSlIEJRstM7yojUKT-heuHiZpsj_lFXP0CG3gGCeJ8KKAQDclr8ifEziFWVUe1kDMKcrMYQnGTAtjheTQaceXX9BQbZBuCGz5SQjPuYo3GALdyEGBZc3k-w3IPXfiZXNtOD8loILuuogfDBOl0q4v5d4lVu2dN16-sLPMDgA_AcRVyRxZtkn_1Ggx9e4N_QUaqw8NaUPRKEBFO56KsSchFoZF30BRm-i844p2NSWr3tYqZ9jri1NUU7eDso-A",
    badge: "Premium Service",
    name: "Elite Plumbing",
    reviews: "42 Reviews",
    rating: "5.0",
    price: "₹999",
  },
];

function parseTitle(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "Plumbing Services";
  }
  return value ?? "Plumbing Services";
}

export function ServiceListingGridScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string | string[] }>();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeFilterId, setActiveFilterId] = useState("all");
  const { refreshing, onRefresh } = usePullToRefresh();

  const title = useMemo(() => parseTitle(params.title), [params.title]);
  const topBarHeight = useMemo(() => insets.top + 64, [insets.top]);
  const bottomNavPadding = Math.max(insets.bottom, 8);
  const columns = screenWidth >= 920 ? 3 : 2;
  const cardWidth = useMemo(() => {
    const totalGap = GRID_GAP * (columns - 1);
    return (screenWidth - CONTAINER_PADDING * 2 - totalGap) / columns;
  }, [columns, screenWidth]);

  const handleBottomTabPress = useTabNavigation();

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      <View
        className="absolute inset-x-0 top-0 z-50 border-b border-slate-100 bg-white/80 px-4"
        style={{
          paddingTop: insets.top,
          height: topBarHeight,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        <View className="h-16 flex-row items-center justify-between">
          <View className="flex-row items-center gap-4">
            <MaterialIcons name="storefront" size={24} color="#27BB97" />
            <Text className="text-[20px] font-black tracking-tight text-[#27BB97]">
              Listifys
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Pressable
              className="rounded-full p-2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialIcons name="search" size={22} color="#64748B" />
            </Pressable>
            <Pressable
              className="rounded-full p-2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialIcons name="notifications" size={22} color="#64748B" />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#27BB97"]}
            tintColor="#27BB97"
            progressViewOffset={topBarHeight}
          />
        }
        contentContainerStyle={{
          paddingTop: topBarHeight + 16,
          paddingBottom: 90 + bottomNavPadding,
          paddingHorizontal: CONTAINER_PADDING,
        }}
      >
        <View className="mb-6 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => router.back()}
              className="-ml-2 h-10 w-10 items-center justify-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialIcons name="arrow-back" size={22} color="#161D1A" />
            </Pressable>
            <Text className="text-[24px] font-bold tracking-tight text-[#161D1A]">
              {title}
            </Text>
          </View>

          <Pressable
            className="flex-row items-center gap-1 rounded-lg border px-3 py-1.5"
            style={{ borderColor: "#BBCAC3" }}
          >
            <MaterialIcons name="filter-list" size={20} color="#3C4A44" />
            <Text className="text-[12px] font-medium text-[#3C4A44]">
              Filter
            </Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          className="mb-6"
        >
          {filterChips.map((chip) => {
            const isActive = chip.id === activeFilterId;
            return (
              <Pressable
                key={chip.id}
                onPress={() => setActiveFilterId(chip.id)}
                className="rounded-full px-4 py-2"
                style={({ pressed }) => ({
                  backgroundColor: isActive ? "#27BB97" : "#FFFFFF",
                  borderWidth: isActive ? 0 : 1,
                  borderColor: isActive ? "transparent" : "#BBCAC3",
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                  shadowColor: isActive ? "#27BB97" : "transparent",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isActive ? 0.18 : 0,
                  shadowRadius: 8,
                  elevation: isActive ? 3 : 0,
                })}
              >
                <Text
                  className="text-[12px] font-medium"
                  style={{ color: isActive ? "#FF0000" : "#3C4A44" }}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View
          className="flex-row flex-wrap"
          style={{ columnGap: GRID_GAP, rowGap: GRID_GAP }}
        >
          {serviceCards.map((card) => (
            <Pressable
              key={card.id}
              onPress={() =>
                router.push({
                  pathname: "/service-detail",
                  params: {
                    name: card.name,
                    badge: card.badge,
                    startingPrice: card.price,
                  },
                })
              }
              className="overflow-hidden rounded-xl border border-slate-100 bg-white"
              style={{ width: cardWidth }}
            >
              <View
                className="relative w-full overflow-hidden"
                style={{ aspectRatio: 4 / 5 }}
              >
                <Image
                  source={card.image}
                  contentFit="cover"
                  transition={200}
                  className="h-full w-full"
                />

                <Pressable
                  className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full border border-slate-100 bg-white/70"
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <MaterialIcons
                    name={card.liked ? "favorite" : "favorite-border"}
                    size={16}
                    color={card.liked ? "#EF4444" : "#161D1A"}
                  />
                </Pressable>

                <View className="absolute bottom-2 left-2 flex-row items-center gap-1 rounded-lg border border-slate-100 bg-white/70 px-2 py-1">
                  <MaterialIcons name="star" size={14} color="#EAB308" />
                  <Text className="text-[11px] font-bold text-[#161D1A]">
                    {card.rating}
                  </Text>
                </View>
              </View>

              <View className="gap-1 p-3">
                <Text className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#27BB97]">
                  {card.badge}
                </Text>
                <Text
                  numberOfLines={1}
                  className="text-[18px] font-semibold leading-6 text-[#161D1A]"
                >
                  {card.name}
                </Text>
                <Text className="text-[11px] text-slate-400">
                  {card.reviews}
                </Text>

                <View className="mt-2 flex-row items-end gap-1">
                  <Text className="text-[16px] font-bold text-[#161D1A]">
                    {card.price}
                  </Text>
                  <Text className="text-[10px] text-slate-400">/visit</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <FloatingBottomNav activeTabId="search" onTabPress={handleBottomTabPress} />
    </View>
  );
}
