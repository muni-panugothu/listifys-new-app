import { memo } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

type EventsStoryProgressProps = {
  total: number;
  activeIndex: number;
  progress: SharedValue<number>;
};

function EventsStoryProgressImpl({
  total,
  activeIndex,
  progress,
}: EventsStoryProgressProps) {
  if (total <= 0) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 4,
        paddingHorizontal: 14,
        marginTop: 12,
      }}
    >
      {Array.from({ length: total }).map((_, index) => (
        <StorySegment
          key={index}
          index={index}
          activeIndex={activeIndex}
          progress={progress}
        />
      ))}
    </View>
  );
}

function StorySegment({
  index,
  activeIndex,
  progress,
}: {
  index: number;
  activeIndex: number;
  progress: SharedValue<number>;
}) {
  const fillStyle = useAnimatedStyle(() => {
    if (index < activeIndex) return { width: "100%" as const };
    if (index > activeIndex) return { width: "0%" as const };
    return { width: `${Math.min(100, Math.max(0, progress.value * 100))}%` as const };
  });

  return (
    <View
      style={{
        flex: 1,
        height: 2.5,
        borderRadius: 2,
        backgroundColor: "rgba(255,255,255,0.28)",
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          {
            height: "100%",
            backgroundColor: "#FFFFFF",
            borderRadius: 2,
          },
          fillStyle,
        ]}
      />
    </View>
  );
}

export const EventsStoryProgress = memo(EventsStoryProgressImpl);
