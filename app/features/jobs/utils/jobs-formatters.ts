import type { ListingItem } from "@/features/listing/services/listing-api";
import { getCurrencyCodeFromCountry, getCurrencySymbol } from "@/lib/currency";

export type ApplicantAvatar = {
  profileImage?: string | null;
  name?: string;
};

const COMPANY_NAME_DOMAINS: Record<string, string> = {
  amazon: "amazon.com",
  tcs: "tcs.com",
  cognizant: "cognizant.com",
  google: "google.com",
  microsoft: "microsoft.com",
  flipkart: "flipkart.com",
  infosys: "infosys.com",
  wipro: "wipro.com",
  accenture: "accenture.com",
  ibm: "ibm.com",
  meta: "meta.com",
  facebook: "meta.com",
  apple: "apple.com",
  netflix: "netflix.com",
  hcl: "hcltech.com",
  capgemini: "capgemini.com",
  deloitte: "deloitte.com",
  oracle: "oracle.com",
  sap: "sap.com",
  adobe: "adobe.com",
  paytm: "paytm.com",
  zomato: "zomato.com",
  swiggy: "swiggy.com",
  uber: "uber.com",
  ola: "olacabs.com",
  byju: "byjus.com",
  phonepe: "phonepe.com",
};

function extractCompanyDomain(website?: string | null): string | null {
  if (!website?.trim()) return null;
  try {
    const url = website.includes("://") ? website : `https://${website.trim()}`;
    const host = new URL(url).hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    return null;
  }
}

function domainFromCompanyName(name?: string | null): string | null {
  if (!name?.trim()) return null;
  const normalized = name.trim().toLowerCase();
  if (COMPANY_NAME_DOMAINS[normalized]) return COMPANY_NAME_DOMAINS[normalized];

  const firstWord = normalized.split(/\s+/)[0]?.replace(/[^a-z0-9]/g, "");
  if (firstWord && COMPANY_NAME_DOMAINS[firstWord]) return COMPANY_NAME_DOMAINS[firstWord];

  return null;
}

export function resolveCompanyLogoUrl(job: JobListingExtras): string | null {
  if (job.company?.logo?.trim()) return job.company.logo.trim();
  if (job.companyLogo?.trim()) return job.companyLogo.trim();

  const domain =
    extractCompanyDomain(job.company?.website ?? job.companyWebsite) ??
    domainFromCompanyName(job.company?.name ?? job.companyName ?? job.sellerName);

  if (domain) return `https://logo.clearbit.com/${domain}`;

  return null;
}

export function getCompanyDisplayName(job: JobListingExtras): string {
  return job.company?.name?.trim() || job.companyName?.trim() || job.sellerName?.trim() || "Company";
}

export function getCompanyInitial(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
  }
  const single = words[0]?.charAt(0) ?? "C";
  return single.toUpperCase();
}

export type JobCompanyMeta = {
  id?: string | null;
  name?: string | null;
  logo?: string | null;
  website?: string | null;
  email?: string | null;
  industry?: string | null;
  location?: string | null;
  isVerified?: boolean;
};

export type JobListingExtras = ListingItem & {
  company?: JobCompanyMeta;
  companyName?: string;
  companyLogo?: string;
  companyWebsite?: string;
  jobType?: string;
  workMode?: string;
  employmentType?: string;
  experience?: string;
  education?: string;
  skills?: string[];
  benefits?: string[];
  requirements?: string;
  responsibilities?: string;
  aboutCompany?: string;
  industry?: string;
  department?: string;
  positions?: number;
  applyLink?: string;
  shiftTiming?: string;
  workSchedule?: string;
  appliedBy?: string[];
  applicantAvatars?: ApplicantAvatar[];
  applicantCount?: number;
  interactionCount?: number;
  salary?: { min?: number; max?: number; type?: string };
  salaryType?: string;
};

export function formatJobSalary(
  job: JobListingExtras,
  isoCountryCode?: string | null,
): string {
  const salary = job.salary;
  const currencyCode = job.currency ?? getCurrencyCodeFromCountry(isoCountryCode);
  const symbol = getCurrencySymbol(currencyCode);
  if (salary?.min && salary?.max) {
    const fmt = (n: number) => {
      if (n >= 100000) return `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
      if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
      return n.toLocaleString("en-IN");
    };
    return `${symbol}${fmt(salary.min)} - ${symbol}${fmt(salary.max)}`;
  }
  if (job.price) {
    return `${symbol}${Number(job.price).toLocaleString("en-IN")}`;
  }
  return "Salary not disclosed";
}

export function getJobApplicantCount(job: JobListingExtras): number {
  if (typeof job.applicantCount === "number" && job.applicantCount > 0) {
    return job.applicantCount;
  }
  if (typeof job.interactionCount === "number" && job.interactionCount > 0) {
    return job.interactionCount;
  }
  return job.appliedBy?.length ?? 0;
}

export function getPrimaryWorkBadge(job: JobListingExtras): string {
  return job.workMode?.trim() || job.jobType?.trim() || job.employmentType?.trim() || "";
}

export function getExtraTagCount(job: JobListingExtras): number {
  const primary = getPrimaryWorkBadge(job).toLowerCase();
  const extras = [
    job.workMode,
    job.jobType,
    job.employmentType,
    job.experience,
    job.subcategory,
  ].filter((tag) => {
    if (!tag?.trim()) return false;
    return tag.trim().toLowerCase() !== primary;
  });
  return extras.length;
}

export function getJobWorkingHours(job: JobListingExtras): string {
  return job.shiftTiming?.trim() || job.workSchedule?.trim() || "Flexible";
}

export function isJobApplied(job: JobListingExtras, userId?: string | null): boolean {
  if (!userId) return false;
  return Boolean(job.appliedBy?.includes(userId));
}

export function getCompanyLocation(job: JobListingExtras): string {
  const loc = job.location?.trim();
  if (!loc) return "";
  return loc.split(",")[0]?.trim() || loc;
}
