import { LucideIcon } from "lucide-react";
import {
  Palette,
  Music,
  UtensilsCrossed,
  Bike,
  Heart,
  Users,
  GraduationCap,
  Sparkles,
  Baby,
  Gamepad2,
  Zap,
  Smile,
  Home,
  Sun,
  Clock,
  DollarSign,
  Accessibility,
} from "lucide-react";

export type InterestCategory = {
  name: string;
  icon: LucideIcon;
  items: string[];
};

export type VibeCategory = {
  name: string;
  icon: LucideIcon;
  items: string[];
};

export const INTEREST_CATEGORIES: InterestCategory[] = [
  {
    name: "Arts & Culture",
    icon: Palette,
    items: [
      "Visual Arts",
      "Theater & Dance",
      "Film & Cinema",
      "Photography",
      "Literature",
      "Crafts & DIY",
    ],
  },
  {
    name: "Music",
    icon: Music,
    items: [
      "Live Music",
      "Concerts & Festivals",
      "Rock",
      "Jazz",
      "Classical",
      "Electronic",
      "Hip-Hop",
      "Indie",
    ],
  },
  {
    name: "Food & Drink",
    icon: UtensilsCrossed,
    items: [
      "Food Festivals",
      "Wine Tasting",
      "Beer Tasting",
      "Cocktails",
      "Cooking Classes",
      "Restaurant Week",
    ],
  },
  {
    name: "Active & Outdoors",
    icon: Bike,
    items: [
      "Hiking",
      "Sports",
      "Fitness Classes",
      "Cycling",
      "Water Sports",
      "Adventure",
    ],
  },
  {
    name: "Wellness & Mindfulness",
    icon: Heart,
    items: [
      "Meditation",
      "Yoga",
      "Sound Baths",
      "Wellness Workshops",
      "Breathwork",
    ],
  },
  {
    name: "Social & Community",
    icon: Users,
    items: [
      "Networking",
      "Meetups",
      "Street Fairs",
      "Volunteering",
      "Cultural Celebrations",
    ],
  },
  {
    name: "Learning & Growth",
    icon: GraduationCap,
    items: [
      "Workshops",
      "Lectures",
      "Panel Discussions",
      "Tech Events",
    ],
  },
  {
    name: "Nightlife & Entertainment",
    icon: Sparkles,
    items: ["Comedy Shows", "Clubs & Dancing", "Bars & Lounges", "Karaoke"],
  },
  {
    name: "Family & Kids",
    icon: Baby,
    items: ["Family Events", "Kids Activities", "Educational Programs"],
  },
  {
    name: "Special Interests",
    icon: Gamepad2,
    items: [
      "Gaming & Esports",
      "Anime & Comics",
      "Cars & Motorcycles",
      "Fashion & Beauty",
      "Pets & Animals",
      "Sustainability",
    ],
  },
];

export const VIBE_CATEGORIES: VibeCategory[] = [
  {
    name: "Energy Level",
    icon: Zap,
    items: ["High-Energy", "Chill", "Intimate"],
  },
  {
    name: "Social Style",
    icon: Users,
    items: [
      "Solo-Friendly",
      "Great for Dates",
      "Friend Hangout",
      "Networking",
      "Family-Oriented",
      "Meet New People",
    ],
  },
  {
    name: "Setting",
    icon: Home,
    items: [
      "Indoor",
      "Outdoor",
      "Waterfront",
      "Rooftop",
      "Historic Venue",
      "Unconventional",
    ],
  },
  {
    name: "Time Preferences",
    icon: Clock,
    items: ["Morning Person", "Brunch Vibes", "Afternoon", "Evening", "Late Night"],
  },
  {
    name: "Cost",
    icon: DollarSign,
    items: ["Free Events", "Budget-Friendly", "Worth the Splurge", "Donation-Based"],
  },
  {
    name: "Accessibility",
    icon: Accessibility,
    items: ["Wheelchair Accessible", "All Ages", "21+", "Pet-Friendly"],
  },
];

export const getAllInterests = (): string[] => {
  return INTEREST_CATEGORIES.flatMap((category) => category.items);
};

export const getAllVibes = (): string[] => {
  return VIBE_CATEGORIES.flatMap((category) => category.items);
};
