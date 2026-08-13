import { Platform } from "react-native";

import { AUTH_API_BASE_URL, resolveAbsoluteMediaUrl, requestJson } from "@/features/auth/services/auth-api";
import { authenticatedMultipartPost } from "@/lib/authenticated-multipart";

export type EmployerCompanyProfile = {
  _id?: string;
  companyName?: string;
  companyLogo?: string;
  companyWebsite?: string;
  companyEmail?: string;
  aboutCompany?: string;
  industry?: string;
  location?: string;
  isVerified?: boolean;
};

export async function fetchMyEmployerCompanyProfile(): Promise<EmployerCompanyProfile | null> {
  const data = await requestJson<{ success: boolean; profile?: EmployerCompanyProfile | null }>(
    "/api/jobs/company-profile/me",
  );
  const profile = data.profile ?? null;
  if (!profile) return null;

  return {
    ...profile,
    companyLogo: resolveAbsoluteMediaUrl(profile.companyLogo) ?? profile.companyLogo,
  };
}

export async function upsertEmployerCompanyProfile(
  payload: Partial<EmployerCompanyProfile>,
): Promise<EmployerCompanyProfile> {
  const data = await requestJson<{ success: boolean; profile: EmployerCompanyProfile }>(
    "/api/jobs/company-profile/me",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );

  const profile = data.profile;
  return {
    ...profile,
    companyLogo: resolveAbsoluteMediaUrl(profile.companyLogo) ?? profile.companyLogo,
  };
}

export async function uploadEmployerCompanyLogo(localUri: string): Promise<string> {
  const filename = localUri.split("/").pop() || `company-logo_${Date.now()}.jpg`;
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1] : "jpg";
  const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;

  const buildFormData = () => {
    const formData = new FormData();
    formData.append("logo", {
      uri: Platform.OS === "android" ? localUri : localUri.replace("file://", ""),
      name: filename,
      type: mimeType,
    } as unknown as Blob);
    return formData;
  };

  const response = await authenticatedMultipartPost(
    `${AUTH_API_BASE_URL}/api/jobs/company-profile/upload-logo`,
    buildFormData,
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { message?: string })?.message || "Company logo upload failed",
    );
  }

  const url = (data as { companyLogo?: string }).companyLogo;
  if (!url) {
    throw new Error("Company logo upload succeeded but no URL was returned.");
  }

  return resolveAbsoluteMediaUrl(url) ?? url;
}
