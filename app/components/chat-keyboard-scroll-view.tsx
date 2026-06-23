import React, { forwardRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  KeyboardChatScrollView as BaseKeyboardChatScrollView,
} from "@/lib/safe-keyboard-controller";
import type { ScrollViewProps } from "react-native";

const INPUT_MARGIN = 8;

type ChatScrollProps = ScrollViewProps & {
  offset?: number;
  automaticallyAdjustContentInsets?: boolean;
  contentInsetAdjustmentBehavior?: string;
  keyboardDismissMode?: ScrollViewProps["keyboardDismissMode"];
};

/** Scroll wrapper for chat FlatList — keeps messages aligned with the keyboard. */
export const ChatKeyboardScrollView = forwardRef<
  React.ElementRef<typeof BaseKeyboardChatScrollView>,
  ChatScrollProps
>((props, ref) => {
  const { bottom } = useSafeAreaInsets();

  return (
    <BaseKeyboardChatScrollView
      ref={ref}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="none"
      offset={Math.max(bottom - INPUT_MARGIN, 0)}
      {...props}
    />
  );
});

ChatKeyboardScrollView.displayName = "ChatKeyboardScrollView";

export { useKeyboardStickyOffset } from "@/hooks/use-keyboard-sticky-offset";
