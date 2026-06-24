export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocument = {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
  contactEmail: string;
};

export const LEGAL_LAST_UPDATED = "June 24, 2026";
export const LEGAL_CONTACT_EMAIL = "legal@listifys.com";
export const SUPPORT_EMAIL = "support@listifys.com";

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  lastUpdated: LEGAL_LAST_UPDATED,
  contactEmail: LEGAL_CONTACT_EMAIL,
  intro:
    "Listify (“we”, “us”, “our”) helps people buy, sell, and connect locally. This Privacy Policy explains what information we collect, how we use it, and the choices you have. By using Listify, you agree to this policy.",
  sections: [
    {
      id: "information-we-collect",
      title: "Information we collect",
      paragraphs: [
        "We collect information you provide directly and information generated when you use the app.",
      ],
      bullets: [
        "Account details: name, email, phone number, profile photo, and password (stored securely).",
        "Listings & content: photos, descriptions, prices, categories, and messages you send.",
        "Location: approximate or precise location when you allow it — used to show nearby listings and distances.",
        "Device & usage: device model, OS version, app version, IP address, and how you interact with features.",
        "Communications: in-app chat, offers, notifications preferences, and support requests.",
        "Payment-related metadata: we do not store full card numbers; payment partners handle transactions when applicable.",
      ],
    },
    {
      id: "how-we-use",
      title: "How we use your information",
      bullets: [
        "Operate the marketplace: publish listings, match buyers and sellers, and enable chat and offers.",
        "Personalize your experience: recommendations, saved items, and relevant search results.",
        "Keep you safe: fraud detection, content moderation, and account security alerts.",
        "Send notifications: messages, offers, price drops, and account activity (you can control push settings).",
        "Improve Listify: analytics, debugging, and product development.",
        "Comply with law: respond to legal requests and enforce our Terms of Service.",
      ],
    },
    {
      id: "sharing",
      title: "When we share information",
      paragraphs: [
        "We do not sell your personal information. We share data only as described below:",
      ],
      bullets: [
        "With other users: your public profile, listings, and messages you send are visible to the people you interact with.",
        "Service providers: cloud hosting, email/SMS, maps, analytics, and push notification services under strict contracts.",
        "Legal & safety: when required by law or to protect users, Listify, or the public.",
        "Business transfers: if Listify is involved in a merger or acquisition, with notice where required.",
      ],
    },
    {
      id: "your-choices",
      title: "Your choices & controls",
      bullets: [
        "Profile & listings: edit or delete your content from the app at any time.",
        "Push notifications: toggle off in Settings → Notifications.",
        "Location: disable in your device settings; some features may be limited.",
        "Marketing emails: unsubscribe using the link in any promotional email.",
        "Account deletion: permanently remove your account under Settings → Delete account.",
      ],
    },
    {
      id: "retention",
      title: "Data retention",
      paragraphs: [
        "We keep your information while your account is active and as needed to provide services, resolve disputes, enforce agreements, and meet legal obligations. Deleted accounts are removed from active systems within a reasonable period, though backups may persist for a limited time.",
      ],
    },
    {
      id: "security",
      title: "Security",
      paragraphs: [
        "We use industry-standard measures including encryption in transit, secure authentication, and access controls. No method of transmission or storage is 100% secure — please use a strong password and report suspicious activity immediately.",
      ],
    },
    {
      id: "children",
      title: "Children",
      paragraphs: [
        "Listify is not intended for users under 18. We do not knowingly collect data from children. Contact us if you believe a child has provided personal information.",
      ],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      paragraphs: [
        "We may update this Privacy Policy from time to time. We will post the new version in the app and update the “Last updated” date. Continued use after changes means you accept the updated policy.",
      ],
    },
    {
      id: "contact",
      title: "Contact us",
      paragraphs: [
        "Questions about privacy? Email us at legal@listifys.com or write to Listify Support, India.",
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  title: "Terms of Service",
  lastUpdated: LEGAL_LAST_UPDATED,
  contactEmail: LEGAL_CONTACT_EMAIL,
  intro:
    "Welcome to Listify. These Terms of Service (“Terms”) govern your access to and use of the Listify mobile app and related services. Please read them carefully before using Listify.",
  sections: [
    {
      id: "acceptance",
      title: "Acceptance of terms",
      paragraphs: [
        "By creating an account or using Listify, you agree to these Terms and our Privacy Policy. If you do not agree, do not use the service.",
      ],
    },
    {
      id: "eligibility",
      title: "Eligibility",
      bullets: [
        "You must be at least 18 years old and legally able to enter a contract.",
        "You must provide accurate registration information and keep it up to date.",
        "One person may not maintain multiple accounts for abusive or fraudulent purposes.",
      ],
    },
    {
      id: "marketplace-role",
      title: "Listify’s role",
      paragraphs: [
        "Listify is a platform that connects buyers and sellers. We are not a party to transactions between users unless explicitly stated. You are responsible for your listings, communications, and any agreement you make with another user.",
      ],
    },
    {
      id: "listings-conduct",
      title: "Listings & acceptable use",
      bullets: [
        "Post only items and services you have the right to sell or offer.",
        "No illegal, stolen, counterfeit, dangerous, or prohibited items (weapons, drugs, etc.).",
        "No misleading titles, prices, or photos; keep listings accurate and current.",
        "No harassment, spam, scraping, or attempts to bypass Listify systems.",
        "Respect intellectual property and do not copy others’ content without permission.",
      ],
    },
    {
      id: "transactions",
      title: "Transactions & payments",
      paragraphs: [
        "Payment methods and delivery are arranged between users unless Listify offers a protected payment feature. Listify is not responsible for payment disputes, item quality, or non-delivery unless we explicitly provide a buyer/seller protection program.",
      ],
    },
    {
      id: "messaging",
      title: "Messaging & offers",
      paragraphs: [
        "Chat and offers are for legitimate marketplace communication. Do not share sensitive financial information in chat. We may review reported content to enforce these Terms.",
      ],
    },
    {
      id: "content-license",
      title: "Your content",
      paragraphs: [
        "You retain ownership of content you post. You grant Listify a worldwide, non-exclusive license to host, display, and distribute your content solely to operate and promote the service.",
      ],
    },
    {
      id: "termination",
      title: "Suspension & termination",
      paragraphs: [
        "We may suspend or terminate accounts that violate these Terms or pose risk to the community. You may delete your account at any time from Settings.",
      ],
    },
    {
      id: "disclaimers",
      title: "Disclaimers",
      paragraphs: [
        "Listify is provided “as is” without warranties of any kind. We do not guarantee uninterrupted service, accuracy of user content, or successful transactions.",
      ],
    },
    {
      id: "liability",
      title: "Limitation of liability",
      paragraphs: [
        "To the fullest extent permitted by law, Listify and its affiliates are not liable for indirect, incidental, or consequential damages arising from your use of the service. Our total liability is limited to the greater of amounts you paid us in the past 12 months or ₹1,000.",
      ],
    },
    {
      id: "governing-law",
      title: "Governing law",
      paragraphs: [
        "These Terms are governed by the laws of India. Disputes shall be subject to the exclusive jurisdiction of courts in India, unless otherwise required by applicable consumer protection law.",
      ],
    },
    {
      id: "contact",
      title: "Contact",
      paragraphs: [
        "For questions about these Terms, contact legal@listifys.com.",
      ],
    },
  ],
};

export const ABOUT_HIGHLIGHTS = [
  {
    icon: "storefront" as const,
    title: "Local marketplace",
    description: "Buy and sell electronics, vehicles, fashion, furniture, and more near you.",
  },
  {
    icon: "chat-bubble-outline" as const,
    title: "Chat & offers",
    description: "Message sellers, negotiate offers, and close deals in one place.",
  },
  {
    icon: "home-repair-service" as const,
    title: "Services & jobs",
    description: "Discover local services, properties, events, and job listings.",
  },
  {
    icon: "verified-user" as const,
    title: "Built for trust",
    description: "Report listings, manage devices, and control notifications from Settings.",
  },
] as const;

export const ABOUT_SAFETY_TIPS = [
  "Meet in public places for in-person exchanges.",
  "Never send advance payments to unverified users.",
  "Use in-app chat so you have a record of the conversation.",
  "Report suspicious listings or behaviour from the item menu.",
] as const;
