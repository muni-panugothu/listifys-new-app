/** Reference mockup accent blue */
export const JOBS_BLUE = "#5B9DF5";
export const JOBS_BLUE_DARK = "#3B7DD8";
export const JOBS_APPLY_TEAL = "#27BB97";
export const JOBS_PAGE_BG = "#F7F8FA";
export const JOBS_CARD_BG = "#FFFFFF";
export const JOBS_CHIP_ACTIVE_BG = "#5B9DF5";
export const JOBS_CHIP_INACTIVE_BG = "#F3F4F6";

export type JobsCategoryChip = {
  id: string;
  label: string;
  subcategory?: string;
  workMode?: string;
  jobType?: string;
  search?: string;
};

export const JOBS_CATEGORY_CHIPS: JobsCategoryChip[] = [
  { id: "ui-ux", label: "UI/UX Designer", search: "UI UX Designer" },
  { id: "graphic", label: "Graphic Designer", search: "Graphic Designer" },
  { id: "hybrid", label: "Hybrid", workMode: "Hybrid" },
  { id: "remote", label: "Remote", workMode: "Remote" },
  { id: "full-time", label: "Full Time", jobType: "Full-time" },
  { id: "part-time", label: "Part Time", subcategory: "Part Time" },
  { id: "software", label: "Software", search: "Software", subcategory: "IT Jobs" },
  { id: "marketing", label: "Marketing", search: "Marketing" },
  { id: "sales", label: "Sales", search: "Sales" },
  { id: "finance", label: "Finance", search: "Finance" },
];

export const JOBS_UI_ICONS = {
  bookmark: require("@/assets/jobs/ui/jobs-icon-bookmark.png"),
  bookmarkOutline: require("@/assets/jobs/ui/jobs-icon-bookmark-outline.png"),
  applyArrow: require("@/assets/jobs/ui/jobs-icon-apply-arrow.png"),
  trusted: require("@/assets/jobs/ui/jobs-icon-trusted.png"),
} as const;

export const JOBS_SORT_OPTIONS = [
  { key: "newest", label: "Recently" },
  { key: "relevance", label: "Popular" },
  { key: "price_desc", label: "Salary: High to Low" },
  { key: "price_asc", label: "Salary: Low to High" },
] as const;
