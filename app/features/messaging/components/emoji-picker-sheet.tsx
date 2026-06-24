/**
 * EmojiPickerSheet — lightweight emoji picker for the chat composer.
 * No extra dependency: ships a curated set of the most-used emojis grouped
 * into 6 tabs. Tap an emoji to append it to the input.
 */
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { ListifyFonts } from "@/constants/typography";

const BRAND     = "#27BB97";
const TEXT_DARK = "#1A1A1A";
const TEXT_MUTED = "#9CA3AF";

// Categories use a glyph as the tab itself — keeps all 6 visible on a phone
// without horizontal scrolling. `label` is shown only on the active tab.
const CATEGORIES: Array<{ id: string; label: string; glyph: string; emojis: string[] }> = [
  {
    id: "smileys",
    label: "Smileys",
    glyph: "😀",
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙",
      "😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥",
      "😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","😎","🤓",
      "🧐","😕","😟","🙁","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞",
    ],
  },
  {
    id: "gestures",
    label: "Gestures",
    glyph: "👍",
    emojis: [
      "👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👋","🤚","🖐️","✋","🖖","👏",
      "🙌","🤝","🙏","✍️","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🦷","🦴","👀","👁️","👅","👄",
    ],
  },
  {
    id: "hearts",
    label: "Hearts",
    glyph: "❤️",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","💌",
      "💋","💯","💢","💥","💫","💦","💨","🕳️","💣","💬","🗨️","🗯️","💭","💤",
    ],
  },
  {
    id: "animals",
    label: "Animals",
    glyph: "🐶",
    emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆",
      "🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐢","🐍","🦎","🦂","🦀","🐙","🦑","🦐",
    ],
  },
  {
    id: "food",
    label: "Food",
    glyph: "🍎",
    emojis: [
      "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑",
      "🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈",
    ],
  },
  {
    id: "objects",
    label: "Objects",
    glyph: "⚽",
    emojis: [
      "💼","👜","👝","🎒","👓","🕶️","🥽","🥼","🦺","👔","👕","👖","🧣","🧤","🧥","🧦","👗","👘","🥻","🩱",
      "🚗","🚕","🚙","🚌","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🏍️","🛺","🚲","🛴","🛹","🛼",
      "🔥","✨","🎉","🎊","🎁","🏆","🥇","🥈","🥉","⚽","🏀","🏈","⚾","🎾","🏐","🎱","🏓","🏸","🥊","🎯",
    ],
  },
];

type PanelProps = {
  onClose: () => void;
  onPick: (emoji: string) => void;
  /** Inline panel height when rendered above the composer (not a full-screen modal). */
  height?: number;
};

/** Renders above the chat composer so the text input stays visible while picking emojis. */
export function EmojiPickerPanel({ onClose, onPick, height = 280 }: PanelProps) {
  const [activeId, setActiveId] = useState(CATEGORIES[0].id);
  const active = CATEGORIES.find((c) => c.id === activeId) ?? CATEGORIES[0];

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderTopWidth: 1,
        borderTopColor: "#E5E7EB",
        height,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
        <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 14, color: TEXT_DARK }}>
          {active.label}
        </Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <MaterialIcons name="close" size={20} color={TEXT_MUTED} />
        </Pressable>
      </View>

      <View
        style={{
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomColor: "#E5E7EB",
          paddingHorizontal: 6,
          paddingVertical: 6,
        }}
      >
        {CATEGORIES.map((c) => {
          const isActive = c.id === activeId;
          return (
            <Pressable
              key={c.id}
              onPress={() => setActiveId(c.id)}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 6,
                marginHorizontal: 3,
                borderRadius: 12,
                backgroundColor: isActive ? BRAND + "22" : "transparent",
                borderBottomWidth: isActive ? 2 : 0,
                borderBottomColor: BRAND,
              }}
            >
              <Text style={{ fontSize: 20 }}>{c.glyph}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {active.emojis.map((e, idx) => (
            <Pressable
              key={`${active.id}-${idx}`}
              onPress={() => onPick(e)}
              style={{
                width: "12.5%",
                aspectRatio: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 26 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
};

/** Full-screen modal variant — kept for screens that don't embed the composer. */
export function EmojiPickerSheet({ visible, onClose, onPick }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose} />
        <View style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <EmojiPickerPanel onClose={onClose} onPick={onPick} height={320} />
        </View>
      </View>
    </Modal>
  );
}
