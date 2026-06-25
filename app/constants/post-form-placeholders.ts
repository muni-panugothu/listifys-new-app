/**
 * Category + subcategory aware copy for the post-ad step-2 form.
 * Keys must match `subcategories` strings in `constants/categories.ts` exactly.
 */
export type PlaceholderPair = { title: string; description: string; hint?: string };

type PlaceholderMap = Record<string, PlaceholderPair> & { _default: PlaceholderPair };

const P = (
  title: string,
  description: string,
  hint?: string,
): PlaceholderPair => ({ title, description, hint });

export const MOBILE_DEVICE_SUBCATEGORIES = new Set(["Mobile Phones", "Tablets"]);

export const AD_PLACEHOLDERS: Record<string, PlaceholderMap> = {
  mobiles: {
    "Mobile Phones": P(
      "e.g. iPhone 14 Pro Max 256GB — Battery 96%",
      "Include storage, color, battery health %, box accessories, and any scratches.",
      "Mention IMEI status, bill/warranty, and whether it's unlocked.",
    ),
    Tablets: P(
      "e.g. Samsung Galaxy Tab S9 128GB Wi-Fi — 6 months old",
      "Include storage, screen size, connectivity (Wi-Fi/5G), accessories, and condition.",
      "Note if stylus/keyboard is included.",
    ),
    "Cases & Covers": P(
      "e.g. Spigen Tough Armor for iPhone 15 Pro — Black, Like New",
      "Mention compatible phone model, material (silicone/leather/TPU), type (back/flip/wallet), and condition.",
      "Include whether original packaging or extra features (kickstand, card slot) are included.",
    ),
    "Chargers & Cables": P(
      "e.g. 65W USB-C GaN Charger with 1.2m Cable",
      "Mention wattage, connector type (USB-C/Lightning/micro-USB), cable length, and compatible brands.",
    ),
    "Earphones & Headphones": P(
      "e.g. Sony WH-1000XM5 — Noise Cancelling, Original Box",
      "Include wired/wireless, battery life, what's in the box, and usage duration.",
    ),
    "Power Banks": P(
      "e.g. Mi 20000mAh Power Bank — 18W Fast Charge",
      "Mention capacity (mAh), output ports, fast-charge support, and cycles/condition.",
    ),
    "Smart Watches & Bands": P(
      "e.g. Apple Watch Series 9 GPS 45mm — Midnight Aluminium",
      "Include compatible phone, band size, battery health, and included straps/charger.",
    ),
    "Memory Cards & Storage": P(
      "e.g. SanDisk 128GB microSDXC UHS-I — Class 10",
      "Mention capacity, speed class, compatible devices, and whether it's formatted.",
    ),
    "Screen Guards & Protectors": P(
      "e.g. Tempered Glass for Samsung S24 Ultra — 2 Pack",
      "Include compatible model, material, quantity, and installation kit if any.",
    ),
    "Bluetooth Speakers": P(
      "e.g. JBL Flip 6 Portable Speaker — IP67, Blue",
      "Mention battery life, water resistance, connectivity, and cosmetic condition.",
    ),
    "Selfie Sticks & Tripods": P(
      "e.g. Bluetooth Selfie Stick with Tripod — extends to 1m",
      "Include max height, remote/shutter, phone clamp size, and material.",
    ),
    "Other Accessories": P(
      "e.g. Phone Ring Holder + Car Mount Combo",
      "Describe what the accessory is, compatible devices, and condition.",
    ),
    _default: P(
      "e.g. Mobile accessory — brand new / like new",
      "Describe compatibility, what's included, and condition.",
    ),
  },
  electronics: {
    "TVs, Video - Audio": P(
      "e.g. Sony 55\" 4K Smart TV — 1 Year Old, Remote Included",
      "Include screen size, resolution (4K/HD), smart features, and any panel issues.",
    ),
    Fridges: P(
      "e.g. LG 260L Double Door Fridge — 5 Star, Inverter",
      "Mention capacity (litres), star rating, type (single/double door), age, and cooling performance.",
      "Include installation date and any service history.",
    ),
    "Washing Machines": P(
      "e.g. IFB 7kg Front Load Washing Machine — 2 Years Old",
      "Include load capacity, front/top load, inverter motor, and service records.",
    ),
    ACs: P(
      "e.g. Voltas 1.5 Ton 5-Star Split AC — Copper, 2023 Model",
      "Mention tonnage, star rating, inverter/non-inverter, and installation included or not.",
    ),
    "Kitchen & Other Appliances": P(
      "e.g. Philips Air Fryer 4.1L — Barely Used",
      "Include appliance type, capacity, wattage, age, and working condition.",
    ),
    "Computers & Laptops": P(
      "e.g. MacBook Air M2 16GB/512GB — 2023, Battery 95%",
      "Specify processor, RAM, storage, battery cycles, and charger included.",
    ),
    "Computer Accessories": P(
      "e.g. Logitech MX Master 3S Wireless Mouse",
      "Mention compatibility, connectivity, and what's in the box.",
    ),
    "Hard Disks, Printers & Monitors": P(
      "e.g. Dell 24\" IPS Monitor — 1080p, 75Hz",
      "Include size, resolution, ports, and any dead pixels or issues.",
    ),
    "Cameras & Lenses": P(
      "e.g. Canon EOS R50 Body — 2k Shutter Count",
      "Include shutter count, lenses included, sensor condition, and accessories.",
    ),
    _default: P(
      "e.g. Electronic item — excellent working condition",
      "Include brand, model, age, warranty, and reason for selling.",
    ),
  },
  events: {
    Music: P(
      "e.g. Indie Night Live — Hyderabad Open-Air Concert",
      "Mention artists, genre, venue, ticket tiers, and age restrictions.",
    ),
    "Food & Drink": P(
      "e.g. Street Food Festival 2026 — 50+ Stalls, Live Music",
      "Include cuisine types, tasting passes, timings, and venue details.",
    ),
    Business: P(
      "e.g. Startup Networking Meetup — Founders & Investors",
      "Describe agenda, speakers, dress code, and registration process.",
    ),
    "Health & Wellness": P(
      "e.g. Yoga & Meditation Retreat — Weekend Pass",
      "Include instructor, skill level, what to bring, and schedule.",
    ),
    Film: P(
      "e.g. Outdoor Movie Night — Classic Bollywood Screening",
      "Mention film title, language, seating type, and food options.",
    ),
    Comedy: P(
      "e.g. Stand-Up Comedy Night — 3 Comedians, 90 Minutes",
      "Include language, venue seating, and age guidance.",
    ),
    Art: P(
      "e.g. Contemporary Art Exhibition — Local Artists Showcase",
      "Describe artists, medium, venue, and entry fee if any.",
    ),
    Sports: P(
      "e.g. City Cricket Tournament — 8 Teams, Weekend League",
      "Include sport, format, registration deadline, and venue.",
    ),
    Theater: P(
      "e.g. Play: The Glass Menagerie — Evening Show 7 PM",
      "Mention language, duration, cast, and seating categories.",
    ),
    Education: P(
      "e.g. Free Coding Workshop — React Native for Beginners",
      "Include topics covered, prerequisites, materials provided, and duration.",
    ),
    Community: P(
      "e.g. Neighborhood Clean-Up Drive — Volunteers Welcome",
      "Describe purpose, meeting point, timings, and what to carry.",
    ),
    Other: P(
      "e.g. Local Community Event — All Welcome",
      "Mention date, venue, agenda, and how attendees can register.",
    ),
    _default: P(
      "e.g. Community Event 2026 — All Welcome",
      "Mention date, venue, agenda, ticket price, and registration details.",
    ),
  },
  furniture: {
    "Sofas & Dining": P(
      "e.g. 3-Seater L-Shaped Sofa — Grey Fabric, 2 Years Old",
      "Include dimensions, fabric/leather, seating capacity, and pickup/delivery.",
    ),
    "Beds & Wardrobes": P(
      "e.g. King Size Storage Bed — Teak Wood with Mattress",
      "Mention wood type, size, storage, mattress included, and assembly.",
    ),
    "Tables & Chairs": P(
      "e.g. Solid Wood Dining Table 6-Seater — Teak Finish",
      "Include dimensions, material, chairs included, and condition.",
    ),
    "Home Decor": P(
      "e.g. Hand-Painted Canvas Wall Art Set — 3 Pieces",
      "Describe style, dimensions, material, and mounting hardware if any.",
    ),
    "Office Furniture": P(
      "e.g. Ergonomic Office Chair — Adjustable Lumbar, Mesh Back",
      "Include adjustability, weight capacity, and armrest type.",
    ),
    _default: P(
      "e.g. Home furniture item — good condition",
      "Include material, dimensions, colour, age, and assembly status.",
    ),
  },
  fashion: {
    "Men's Clothing": P(
      "e.g. Zara Slim Chinos — Size 32, Navy, Brand New with Tags",
      "Include brand, size, fabric, fit, and times worn if used.",
    ),
    "Women's Clothing": P(
      "e.g. Fabindia Cotton Kurti — Size M, Unworn",
      "Mention fabric, size, occasion, stitched/unstitched, and care instructions.",
    ),
    Footwear: P(
      "e.g. Nike Air Max 270 — UK 9, Worn Twice",
      "Include size, colour, sole wear, and original box.",
    ),
    Watches: P(
      "e.g. Casio G-Shock GA-2100 — Black, 6 Months Old",
      "Mention model, water resistance, battery type, and box/papers.",
    ),
    _default: P(
      "e.g. Fashion item — size, brand, and condition",
      "Specify brand, size, colour, material, and how many times worn.",
    ),
  },
  vehicles: {
    Cars: P(
      "e.g. 2022 Maruti Swift VXi — 15,000 km, 1st Owner",
      "Include fuel type, transmission, service history, and insurance validity.",
    ),
    Bikes: P(
      "e.g. Royal Enfield Classic 350 — 8,000 km, Single Owner",
      "Mention year, engine CC, modifications, and service records.",
    ),
    Cycle: P(
      "e.g. Hero Sprint Pro 21-Speed MTB — Like New",
      "Include frame size, gear count, accessories, and tyre condition.",
    ),
    "Spare Parts": P(
      "e.g. Honda City Front Bumper — Genuine OEM, 2020 Model",
      "Mention compatible vehicle model/year, part condition, and OEM/aftermarket.",
    ),
    _default: P(
      "e.g. Vehicle listing — year, fuel, km driven",
      "Describe make, model, ownership, and overall condition.",
    ),
  },
  jobs: {
    "IT Jobs": P(
      "e.g. Senior React Native Developer — Remote, 5+ yrs",
      "Include stack, responsibilities, salary range, and perks.",
    ),
    "Non IT Jobs": P(
      "e.g. Field Sales Executive — FMCG, Hyderabad",
      "Mention territory, targets, vehicle required, and CTC.",
    ),
    "Part Time": P(
      "e.g. Weekend Retail Associate — 4 Hours/Day",
      "Include schedule, pay per hour, and location.",
    ),
    "Contract Type": P(
      "e.g. 6-Month Contract — Data Entry, WFH",
      "Specify contract length, deliverables, and payment terms.",
    ),
    _default: P(
      "e.g. Job opening — role, experience, location",
      "Include responsibilities, qualifications, salary, and how to apply.",
    ),
  },
  services: {
    Plumbing: P(
      "e.g. Licensed Plumber — Leak Repair, 24/7 Hyderabad",
      "Describe services, experience, service area, and pricing model.",
    ),
    Cleaning: P(
      "e.g. Deep Home Cleaning — 2BHK from ₹2,499",
      "Mention what's included, chemicals used, and guarantee.",
    ),
    _default: P(
      "e.g. Professional service — your specialty",
      "Describe experience, service area, pricing, and availability.",
    ),
  },
  properties: {
    Apartments: P(
      "e.g. 2BHK Apartment for Rent — Gated Society, 1100 sqft",
      "Include BHK, floor, furnishing, amenities, and preferred tenant.",
    ),
    _default: P(
      "e.g. Property listing — type, area, location",
      "Describe size, furnishing, floor, amenities, and nearby highlights.",
    ),
  },
  sports: {
    _default: P(
      "e.g. Yonex Badminton Racket — 3U, Excellent Grip",
      "Include brand, sport, size/weight, and accessories included.",
    ),
  },
  books: {
    _default: P(
      "e.g. Clean Code by Robert Martin — 2nd Edition",
      "Include author, edition, highlights/notes, and condition.",
    ),
  },
  pets: {
    _default: P(
      " Golden Retriever Puppy — Vaccinated, 3 Months",
      "Include breed, age, vaccination, temperament, and diet.",
    ),
  },
  "pets supplies": {
    _default: P(
      "e.g. Large Dog Crate — 36 inch, Foldable",
      "Mention pet type/size, material, and condition.",
    ),
  },
  beauty: {
    _default: P(
      "e.g. MAC Ruby Woo Lipstick — Sealed, Original",
      "Include brand, shade, expiry (MM/YYYY), and seal status.",
    ),
  },
  toys: {
    _default: P(
      "e.g. LEGO City Police Station — Complete with Box",
      "Mention age group, pieces count, batteries required, and completeness.",
    ),
  },
  collectibles: {
    _default: P(
      "e.g. Vintage Coin — 1971, Certified",
      "Describe era, authenticity, certificates, and condition.",
    ),
  },
  takecare: {
    _default: P(
      "e.g. Experienced Babysitter — CPR Certified, Weekdays",
      "Include experience, languages, availability, and certifications.",
    ),
  },
  others: {
    _default: P(
      "e.g. Item title — short and clear",
      "Describe what you're listing, condition, age, and extras included.",
    ),
  },
  _default: {
    _default: P(
      "e.g. Item in great condition",
      "Describe what you're selling, its condition, age, and any extras.",
    ),
  },
};

export function getAdPlaceholders(category: string, subcategory: string): PlaceholderPair {
  const catMap = AD_PLACEHOLDERS[category] ?? AD_PLACEHOLDERS._default;
  return catMap[subcategory] ?? catMap._default;
}
