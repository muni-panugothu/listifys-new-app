import { type ImageSourcePropType } from "react-native";

export type FirstInstallSlide = {
  id: string;
  illustration: ImageSourcePropType;
  titleParts: { text: string; accent?: boolean }[];
  body: string;
};

export const FIRST_INSTALL_SLIDES: FirstInstallSlide[] = [
  {
    id: "swap-anything",
    illustration: require("../../../assets/onboarding/first-install-onboarding-slide-1.png"),
    titleParts: [
      { text: "Swap Anything,", accent: true },
      { text: " No Cash Needed!" },
    ],
    body: "Trade items easily without money—just list what you have and get what you need.",
  },
  {
    id: "chain-trades",
    illustration: require("../../../assets/onboarding/first-install-onboarding-slide-2.png"),
    titleParts: [
      { text: "Chain Trades? " },
      { text: "Yes!", accent: true },
    ],
    body: "No direct match? Go with chain trades—connect multiple users and swap items through a simple loop.",
  },
  {
    id: "safe-social",
    illustration: require("../../../assets/onboarding/first-install-onboarding-slide-3.png"),
    titleParts: [
      { text: "Safe & Social " },
      { text: "Swapping", accent: true },
    ],
    body: "Trade items easily without money—just list what you have and get what you need.",
  },
];
