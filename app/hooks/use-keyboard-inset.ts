import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Tracks open keyboard height so chat screens can lift the composer + list
 * together (same pattern as Telegram/WhatsApp-style team chat UIs).
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: { endCoordinates?: { height?: number } }) => {
      setInset(e.endCoordinates?.height ?? 0);
    };
    const onHide = () => setInset(0);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return inset;
}
