export type LegalSubsection = {
  id: string;
  label: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
};

export type LegalChapter = {
  id: string;
  roman: string;
  title: string;
  intro?: string;
  subsections: LegalSubsection[];
};

export type LegalDocument = {
  title: string;
  lastUpdated: string;
  intro: string;
  chapters: LegalChapter[];
  contactTitle: string;
  contactEmail: string;
  contactNote?: string;
};

export const LEGAL_LAST_UPDATED = "June 24, 2026";
export const LEGAL_CONTACT_EMAIL = "legal@listifys.com";
export const SUPPORT_EMAIL = "support@listifys.com";
export const ABOUT_WEB_URL = "https://listifys.com";

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  lastUpdated: LEGAL_LAST_UPDATED,
  contactEmail: LEGAL_CONTACT_EMAIL,
  contactTitle: "Questions and Comments",
  contactNote:
    "If you would like to provide feedback about this Privacy Policy, or if you have any questions, please contact us.",
  intro:
    "This Privacy Policy explains how information about you is collected, used, disclosed, and otherwise processed by Listify (“we”, “us”, or “our”). This policy applies when you use our mobile applications, website, and related online services (collectively, the “Listify Service”).\n\nWe may change this Privacy Policy from time to time. If we make changes, we will revise the date at the top of this policy. If we make material changes, we will provide more prominent notice within the app. We encourage you to review this policy whenever you use Listify.",
  chapters: [
    {
      id: "collect",
      roman: "I",
      title: "Information We Collect and How We Collect It",
      subsections: [
        {
          id: "collect-a",
          label: "A",
          title: "Information you provide to us",
          paragraphs: [
            "Listify collects information you provide when you register, create listings, message other users, or contact support, including:",
          ],
          items: [
            "Your name, email address, phone number, and profile photo.",
            "Your account password (stored in encrypted form).",
            "Listing details: photos, titles, descriptions, prices, and categories.",
            "Messages, offers, and reviews you send through Listify.",
            "Government ID or verification documents, if you choose to verify your account.",
            "Any other information you choose to provide.",
          ],
        },
        {
          id: "collect-b",
          label: "B",
          title: "Information we collect automatically",
          paragraphs: ["When you access Listify, we automatically collect information such as:"],
          items: [
            "Device information: hardware model, operating system, app version, and unique device identifiers.",
            "Log data: IP address, access times, pages or screens viewed, and general usage activity.",
            "Location information when you grant permission — used to show nearby listings and distances.",
            "Cookies, analytics SDKs, and similar technologies that help us improve the service.",
          ],
        },
        {
          id: "collect-c",
          label: "C",
          title: "Information from third parties",
          paragraphs: [
            "We may receive information from sign-in providers (such as Google), payment processors, analytics partners, and fraud-prevention services to secure accounts and improve Listify.",
          ],
        },
      ],
    },
    {
      id: "use",
      roman: "II",
      title: "How We Use Your Information",
      subsections: [
        {
          id: "use-a",
          label: "A",
          title: "Purposes of use",
          items: [
            "Verify your account and provide access to the Listify Service.",
            "Connect buyers and sellers, enable chat, offers, and notifications.",
            "Detect and prevent fraud, abuse, and security incidents.",
            "Personalize listings, search results, and recommendations.",
            "Send service messages, security alerts, and promotional communications (where permitted).",
            "Improve, analyze, and develop Listify features.",
            "Comply with legal obligations and enforce our Terms of Service.",
          ],
        },
        {
          id: "use-b",
          label: "B",
          title: "Location of processing",
          paragraphs: [
            "Listify is operated from India. By using the service, you consent to the processing and transfer of information in accordance with this policy and applicable law.",
          ],
        },
      ],
    },
    {
      id: "disclose",
      roman: "III",
      title: "Why Your Information May Be Disclosed",
      subsections: [
        {
          id: "disclose-a",
          label: "A",
          title: "Business disclosures",
          items: [
            "With other users when you post listings, send messages, or make your profile public.",
            "With vendors and service providers who help us operate Listify (hosting, email, SMS, maps, analytics, push notifications).",
            "When required by law, regulation, legal process, or governmental request.",
            "To protect the rights, property, and safety of Listify, our users, or the public.",
            "In connection with a merger, acquisition, or sale of assets, with notice where required.",
            "With your consent or at your direction.",
          ],
        },
        {
          id: "disclose-b",
          label: "B",
          title: "Security",
          paragraphs: [
            "Listify takes reasonable measures to help protect information from loss, theft, misuse, and unauthorized access. No method of transmission or storage is completely secure.",
          ],
        },
      ],
    },
    {
      id: "choices",
      roman: "IV",
      title: "Your Choices",
      subsections: [
        {
          id: "choices-a",
          label: "A",
          title: "Account information",
          items: [
            "Update your profile from Settings → Edit profile.",
            "Turn push notifications on or off from Settings → Notifications.",
            "Delete your account from Settings → Delete account.",
            "We may retain certain information as required by law or for legitimate business purposes.",
          ],
        },
        {
          id: "choices-b",
          label: "B",
          title: "Location information",
          paragraphs: [
            "You can revoke location permission in your device settings. Some features — such as nearby listings — may not work without location access.",
          ],
        },
        {
          id: "choices-c",
          label: "C",
          title: "Promotional communications",
          paragraphs: [
            "You may opt out of promotional emails by using the unsubscribe link in those messages or by updating your preferences in Settings.",
          ],
        },
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  title: "Terms of Service",
  lastUpdated: LEGAL_LAST_UPDATED,
  contactEmail: LEGAL_CONTACT_EMAIL,
  contactTitle: "Questions and Comments",
  contactNote: "For questions about these Terms, please contact us.",
  intro:
    "These Terms of Service (“Terms”) govern your access to and use of the Listify mobile application and related services (the “Listify Service”). By creating an account or using Listify, you agree to these Terms and our Privacy Policy.\n\nWe may update these Terms from time to time. Continued use of Listify after changes become effective constitutes acceptance of the updated Terms.",
  chapters: [
    {
      id: "agreement",
      roman: "I",
      title: "Agreement and Eligibility",
      subsections: [
        {
          id: "agreement-a",
          label: "A",
          title: "Acceptance",
          paragraphs: [
            "By using Listify, you agree to be bound by these Terms. If you do not agree, you may not use the service.",
          ],
        },
        {
          id: "agreement-b",
          label: "B",
          title: "Eligibility",
          items: [
            "You must be at least 18 years old.",
            "You must provide accurate registration information.",
            "You may not use Listify for unlawful, fraudulent, or abusive purposes.",
          ],
        },
      ],
    },
    {
      id: "marketplace",
      roman: "II",
      title: "The Listify Marketplace",
      subsections: [
        {
          id: "marketplace-a",
          label: "A",
          title: "Our role",
          paragraphs: [
            "Listify is a platform that helps users discover, buy, and sell locally. Unless we state otherwise, Listify is not a party to transactions between users and does not take title to items listed on the service.",
          ],
        },
        {
          id: "marketplace-b",
          label: "B",
          title: "Listings and conduct",
          items: [
            "You may list only items or services you have the right to offer.",
            "Prohibited items include illegal goods, weapons, drugs, stolen property, and counterfeit products.",
            "Listings must be accurate — photos, prices, and descriptions must reflect the actual item.",
            "Harassment, spam, scraping, and attempts to circumvent Listify systems are not allowed.",
          ],
        },
        {
          id: "marketplace-c",
          label: "C",
          title: "Messaging and offers",
          paragraphs: [
            "In-app chat and offers must be used for legitimate marketplace communication. Do not share sensitive financial credentials in messages.",
          ],
        },
      ],
    },
    {
      id: "content",
      roman: "III",
      title: "Your Content and Account",
      subsections: [
        {
          id: "content-a",
          label: "A",
          title: "License you grant",
          paragraphs: [
            "You retain ownership of content you post. You grant Listify a non-exclusive, worldwide license to host, display, and distribute your content solely to operate and promote the service.",
          ],
        },
        {
          id: "content-b",
          label: "B",
          title: "Suspension and termination",
          paragraphs: [
            "We may suspend or terminate accounts that violate these Terms or create risk for the community. You may delete your account at any time from Settings.",
          ],
        },
      ],
    },
    {
      id: "legal",
      roman: "IV",
      title: "Disclaimers, Liability, and Law",
      subsections: [
        {
          id: "legal-a",
          label: "A",
          title: "Disclaimers",
          paragraphs: [
            "Listify is provided “as is” without warranties of any kind. We do not guarantee uninterrupted service or the accuracy of user-generated content.",
          ],
        },
        {
          id: "legal-b",
          label: "B",
          title: "Limitation of liability",
          paragraphs: [
            "To the fullest extent permitted by law, Listify is not liable for indirect or consequential damages. Our total liability is limited to the greater of fees you paid us in the past 12 months or ₹1,000.",
          ],
        },
        {
          id: "legal-c",
          label: "C",
          title: "Governing law",
          paragraphs: [
            "These Terms are governed by the laws of India. Disputes are subject to the courts of India, unless consumer protection law in your jurisdiction requires otherwise.",
          ],
        },
      ],
    },
  ],
};

/** OfferUp-style about page content */
export const ABOUT_HERO = {
  headline: "Buy. Sell. Connect.",
  subheadline:
    "Listify brings people together in an easy-to-use mobile app to get more of what they need, right where they are.",
  body: "From finding that perfect chair to hiring someone for a quick repair, Listify helps you get more done locally.",
};

export const ABOUT_FEATURES = [
  {
    id: "finds",
    title: "One-of-a-kind finds",
    description:
      "Whatever you need, discover items with character — and a way better price — right in your neighborhood.",
    icon: "local-offer" as const,
  },
  {
    id: "exchange",
    title: "Stress-free exchange",
    description:
      "Check seller profiles, chat in-app before you meet, and negotiate offers without leaving Listify.",
    icon: "handshake" as const,
  },
  {
    id: "list-fast",
    title: "List fast, sell fast",
    description:
      "Life changes. Your stuff should too. Snap photos, post in minutes, and turn clutter into cash.",
    icon: "photo-camera" as const,
  },
  {
    id: "trust",
    title: "Built for trust",
    description:
      "Report listings, manage signed-in devices, and control notifications — safety tools at your fingertips.",
    icon: "verified-user" as const,
  },
] as const;

export const ABOUT_CATEGORIES = [
  {
    id: "buy-sell",
    label: "Buy & Sell",
    title: "Buy & Sell",
    description:
      "Find great stuff nearby for way less than retail — and pass it on when you are done.",
    icon: "storefront" as const,
  },
  {
    id: "jobs-properties",
    label: "Jobs & Properties",
    title: "Jobs & Properties",
    description:
      "From your first apartment to your next opportunity — discover local listings that move life forward.",
    icon: "apartment" as const,
  },
  {
    id: "services",
    label: "Services",
    title: "Services",
    description:
      "From quick fixes to bigger projects, get help from local pros who know their stuff.",
    icon: "home-repair-service" as const,
  },
] as const;

export const ABOUT_STATS = [
  { value: "10+", label: "listing categories" },
  { value: "In-app", label: "chat & offers" },
  { value: "Local", label: "discovery first" },
  { value: "Secure", label: "account tools" },
] as const;

export const ABOUT_TESTIMONIAL = {
  quote:
    "Listify makes it easy to buy and sell locally. Posting is quick, messaging is simple, and I can find great deals near me.",
  author: "Listify community member",
};
