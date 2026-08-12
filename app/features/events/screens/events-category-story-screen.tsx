import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { AuthGateBottomSheet } from "@/features/auth/components/auth-gate-bottom-sheet";
import { EventsStoryProgress } from "@/features/events/components/events-story/events-story-progress";
import { EventsStorySlide } from "@/features/events/components/events-story/events-story-slide";
import { getEventPrimaryMedia } from "@/features/events/components/event-listing-media";
import {
  EVENTS_WEEK_CATEGORIES,
  type EventsWeekCategory,
} from "@/features/events/data/events-discovery";
import {
  findWeekCategoryIndex,
  getWeekCategoryByIndex,
  resolveWeekStoryExploreId,
} from "@/features/events/data/events-week-story";
import { useCategoryStoryEvents } from "@/features/events/hooks/use-category-story-events";
import { buildEventDetailParams } from "@/features/events/utils/event-detail-helpers";
import { toggleSaveListing } from "@/features/listing/services/listing-api";
import { Image } from "@/lib/nativewind-interop";
import { useAppSelector } from "@/store/hooks";
import {
  selectIsoCountryCode,
  selectLocationCoords,
  selectLocationLabel,
} from "@/store/slices/location-slice";

const STORY_DURATION_MS = 6000;
const SWIPE_UP_THRESHOLD = 72;
const SWIPE_DOWN_THRESHOLD = 96;

function paramString(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function EventsCategoryStoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAppSelector((s) => s.auth.user);
  const locationLabel = useAppSelector(selectLocationLabel);
  const userCoords = useAppSelector(selectLocationCoords);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);

  const params = useLocalSearchParams<{
    categoryId?: string | string[];
    categoryLabel?: string | string[];
    categoryIndex?: string | string[];
    startIndex?: string | string[];
  }>();

  const categoryId = paramString(params.categoryId);
  const categoryLabelParam = paramString(params.categoryLabel);
  const categoryIndex = useMemo(() => {
    const raw = paramString(params.categoryIndex);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    const found = findWeekCategoryIndex(categoryId);
    return found >= 0 ? found : 0;
  }, [categoryId, params.categoryIndex]);

  const weekCategory = useMemo((): EventsWeekCategory => {
    return (
      getWeekCategoryByIndex(categoryIndex) ??
      EVENTS_WEEK_CATEGORIES.find((c) => c.id === categoryId) ?? {
        id: categoryId || "events",
        label: categoryLabelParam || "Events",
        image:
          "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=400&q=80",
        subcategory: "Other",
      }
    );
  }, [categoryId, categoryIndex, categoryLabelParam]);

  const startIndex = useMemo(() => {
    const raw = paramString(params.startIndex);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [params.startIndex]);

  const { events, isLoading, error } = useCategoryStoryEvents({
    weekCategory,
    lat: userCoords?.lat ?? undefined,
    lng: userCoords?.lng ?? undefined,
    countryCode: isoCountryCode,
    locationLabel,
  });

  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [isPaused, setIsPaused] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [authGateVisible, setAuthGateVisible] = useState(false);
  const [authGateAction, setAuthGateAction] = useState<"save" | "message">("save");

  const progress = useSharedValue(0);
  const pauseRef = useRef(false);

  useEffect(() => {
    pauseRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (events.length === 0) return;
    setActiveIndex((prev) => Math.min(prev, events.length - 1));
  }, [events.length]);

  const currentEvent = events[activeIndex];
  const currentPrimaryMedia = currentEvent ? getEventPrimaryMedia(currentEvent) : null;
  const isVideoStory = currentPrimaryMedia?.type === "video";

  const closeStory = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/events-listing" as Href);
  }, [router]);

  const openViewAll = useCallback(() => {
    router.replace({
      pathname: "/events-category",
      params: {
        categoryId: resolveWeekStoryExploreId(weekCategory.id),
        categoryLabel: weekCategory.label,
      },
    } as Href);
  }, [router, weekCategory.id, weekCategory.label]);

  const openDetails = useCallback(() => {
    if (!currentEvent) return;
    const ids = events.map((e) => e._id);
    router.push({
      pathname: "/event-detail",
      params: buildEventDetailParams(currentEvent._id, ids, activeIndex),
    } as Href);
  }, [activeIndex, currentEvent, events, router]);

  const goToIndex = useCallback(
    (nextIndex: number) => {
      if (events.length === 0) return;
      if (nextIndex < 0) {
        setActiveIndex(events.length - 1);
        return;
      }
      if (nextIndex >= events.length) {
        const nextCategoryIndex = categoryIndex + 1;
        const nextCategory = getWeekCategoryByIndex(nextCategoryIndex);
        if (nextCategory) {
          router.replace({
            pathname: "/events-category-story",
            params: {
              categoryId: nextCategory.id,
              categoryLabel: nextCategory.label,
              categoryIndex: String(nextCategoryIndex),
              startIndex: "0",
            },
          } as Href);
          return;
        }
        setActiveIndex(0);
        return;
      }
      setActiveIndex(nextIndex);
    },
    [categoryIndex, events.length, router],
  );

  const goNext = useCallback(() => goToIndex(activeIndex + 1), [activeIndex, goToIndex]);
  const goPrev = useCallback(() => goToIndex(activeIndex - 1), [activeIndex, goToIndex]);

  const startProgress = useCallback(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (events.length === 0 || pauseRef.current || isVideoStory) return;
    progress.value = withTiming(1, { duration: STORY_DURATION_MS }, (finished) => {
      if (finished && !pauseRef.current) {
        runOnJS(goNext)();
      }
    });
  }, [events.length, goNext, isVideoStory, progress]);

  const handleVideoProgress = useCallback(
    (value: number) => {
      if (!isVideoStory || pauseRef.current) return;
      progress.value = Math.max(0, Math.min(value, 1));
    },
    [isVideoStory, progress],
  );

  const handleVideoEnded = useCallback(() => {
    if (!isVideoStory || pauseRef.current) return;
    goNext();
  }, [goNext, isVideoStory]);

  useEffect(() => {
    startProgress();
    return () => cancelAnimation(progress);
  }, [activeIndex, events.length, isPaused, isVideoStory, startProgress, progress]);

  const pauseStories = useCallback(() => {
    setIsPaused(true);
    cancelAnimation(progress);
  }, [progress]);

  const resumeStories = useCallback(() => {
    setIsPaused(false);
  }, []);

  const requireAuth = useCallback((action: "save" | "message", fn: () => void) => {
    if (!user) {
      setAuthGateAction(action);
      setAuthGateVisible(true);
      return;
    }
    fn();
  }, [user]);

  const handleToggleSave = useCallback(async () => {
    if (!currentEvent) return;
    requireAuth("save", async () => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(currentEvent._id)) next.delete(currentEvent._id);
        else next.add(currentEvent._id);
        return next;
      });
      try {
        const res = await toggleSaveListing("events", currentEvent._id);
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (res.saved) next.add(currentEvent._id);
          else next.delete(currentEvent._id);
          return next;
        });
      } catch {
        /* keep optimistic */
      }
    });
  }, [currentEvent, requireAuth]);

  const panGesture = Gesture.Pan().onEnd((e) => {
    if (e.translationY < -SWIPE_UP_THRESHOLD) {
      runOnJS(openDetails)();
      return;
    }
    if (e.translationY > SWIPE_DOWN_THRESHOLD) {
      runOnJS(closeStory)();
      return;
    }
    if (e.translationX < -50) {
      runOnJS(goNext)();
      return;
    }
    if (e.translationX > 50) {
      runOnJS(goPrev)();
    }
  });

  const longPressGesture = Gesture.LongPress()
    .minDuration(180)
    .onStart(() => runOnJS(pauseStories)())
    .onFinalize(() => runOnJS(resumeStories)());

  const composedGesture = Gesture.Simultaneous(panGesture, longPressGesture);

  const isSaved =
    Boolean(currentEvent && savedIds.has(currentEvent._id)) ||
    Boolean(currentEvent && user?.id && currentEvent.savedBy?.includes(user.id));

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" backgroundColor="#000000" />

      <LinearGradient
        colors={["rgba(0,0,0,0.72)", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.85)"]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          zIndex: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable
            onPress={openViewAll}
            style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 10 }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                overflow: "hidden",
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.35)",
              }}
            >
              <Image
                source={weekCategory.image}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={`story-cat-${weekCategory.id}`}
                style={{ width: "100%", height: "100%" }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Text
                  style={{
                    fontFamily: ListifyFonts.bold,
                    fontSize: 16,
                    color: "#FFFFFF",
                  }}
                >
                  {weekCategory.label}
                </Text>
                <MaterialIcons name="chevron-right" size={18} color="#FFFFFF" />
              </View>
              <Text
                style={{
                  marginTop: 2,
                  fontFamily: ListifyFonts.medium,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                View all events
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={closeStory}
            hitSlop={12}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.12)",
            }}
          >
            <MaterialIcons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <EventsStoryProgress
          total={events.length}
          activeIndex={activeIndex}
          progress={progress}
        />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#FFFFFF" size="large" />
        </View>
      ) : error || events.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
        >
          <Text
            style={{
              fontFamily: ListifyFonts.semiBold,
              fontSize: 18,
              color: "#FFFFFF",
              textAlign: "center",
            }}
          >
            No {weekCategory.label.toLowerCase()} events found right now.
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontFamily: ListifyFonts.regular,
              fontSize: 14,
              color: "rgba(255,255,255,0.72)",
              textAlign: "center",
            }}
          >
            Try another category or view all events.
          </Text>
          <Pressable
            onPress={openViewAll}
            style={{
              marginTop: 18,
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.35)",
            }}
          >
            <Text
              style={{
                fontFamily: ListifyFonts.semiBold,
                fontSize: 14,
                color: "#FFFFFF",
              }}
            >
              View all events
            </Text>
          </Pressable>
        </View>
      ) : (
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={{ flex: 1 }}>
            {currentEvent ? (
              <EventsStorySlide
                event={currentEvent}
                isSaved={isSaved}
                isoCountryCode={isoCountryCode}
                isActive
                isPaused={isPaused}
                onVideoEnded={handleVideoEnded}
                onVideoProgress={handleVideoProgress}
                onToggleSave={() => void handleToggleSave()}
              />
            ) : null}

            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 120,
                flexDirection: "row",
              }}
            >
              <Pressable
                style={{ flex: 1 }}
                onPress={goPrev}
                onLongPress={pauseStories}
                onPressOut={resumeStories}
                delayLongPress={180}
              />
              <Pressable
                style={{ flex: 2 }}
                onPress={goNext}
                onLongPress={pauseStories}
                onPressOut={resumeStories}
                delayLongPress={180}
              />
            </View>
          </Animated.View>
        </GestureDetector>
      )}

      {!isLoading && events.length > 0 ? (
        <Pressable
          onPress={openDetails}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: Math.max(insets.bottom, 14),
            alignItems: "center",
            paddingVertical: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={{
                fontFamily: ListifyFonts.medium,
                fontSize: 13,
                color: "rgba(255,255,255,0.82)",
              }}
            >
              Swipe up for details
            </Text>
            <MaterialIcons name="keyboard-arrow-up" size={18} color="rgba(255,255,255,0.82)" />
          </View>
        </Pressable>
      ) : null}

      <AuthGateBottomSheet
        visible={authGateVisible}
        onClose={() => setAuthGateVisible(false)}
        action={authGateAction}
      />
    </View>
  );
}
