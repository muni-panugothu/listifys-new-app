import { type ReactNode, forwardRef } from "react";
import { type ScrollViewProps } from "react-native";
import { KeyboardAwareScrollView } from "@/lib/safe-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type KeyboardFormScrollProps = ScrollViewProps & {
  children: ReactNode;
  /** Extra padding below scroll content when keyboard is open. */
  bottomOffset?: number;
  /** iOS keyboard offset (e.g. header height). */
  keyboardVerticalOffset?: number;
};

/** Scrollable form area that smoothly tracks the keyboard. */
export const KeyboardFormScroll = forwardRef<
  React.ElementRef<typeof KeyboardAwareScrollView>,
  KeyboardFormScrollProps
>(function KeyboardFormScroll(
  {
    children,
    bottomOffset,
    keyboardVerticalOffset = 0,
    contentContainerStyle,
    ...scrollProps
  },
  ref,
) {
  const insets = useSafeAreaInsets();
  const resolvedBottom = bottomOffset ?? Math.max(insets.bottom, 8);

  return (
    <KeyboardAwareScrollView
      ref={ref}
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={resolvedBottom}
      extraKeyboardSpace={keyboardVerticalOffset}
      disableScrollOnKeyboardHide={false}
      contentContainerStyle={[{ flexGrow: 1, paddingBottom: resolvedBottom }, contentContainerStyle]}
      {...scrollProps}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});
