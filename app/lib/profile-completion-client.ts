import type { AuthUser } from "@/features/auth/services/auth-api";
import type { ProfileCompletion } from "@/features/profile/types/profile-completion";

const AUTO_NAME_PATTERN = /^User \d{4}$/i;

const ALL_STEPS = [
  {
    id: "profile_photo",
    label: "Add Profile Photo",
    description: "Upload a profile picture",
    route: "/profile-details-edit",
    field: "photo",
  },
  {
    id: "full_name",
    label: "Complete Full Name",
    description: "Add your full name",
    route: "/profile-details-edit",
    field: "name",
  },
  {
    id: "email_verification",
    label: "Verify Email",
    description: "Verify your email address",
    route: "/change-email",
    field: "email",
  },
  {
    id: "phone_verification",
    label: "Verify Phone",
    description: "Verify your phone number",
    route: "/change-phone-primary",
    field: "phone",
  },
  {
    id: "date_of_birth",
    label: "Add Date of Birth",
    description: "Add your date of birth",
    route: "/profile-details-edit",
    field: "dateOfBirth",
  },
  {
    id: "gender",
    label: "Select Gender",
    description: "Select your gender",
    route: "/profile-details-edit",
    field: "gender",
  },
  {
    id: "location",
    label: "Add Location",
    description: "Add your location",
    route: "/profile-details-edit",
    field: "address",
  },
  {
    id: "bio",
    label: "Write Bio",
    description: "Write a short bio",
    route: "/profile-details-edit",
    field: "bio",
  },
] as const;

function hasCustomProfilePhoto(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (user.profileImageKey) return true;
  if (user.profileImage?.trim()) return true;
  if (user.googleProfileImage?.trim()) return true;
  const avatar = user.avatar?.trim() ?? "";
  if (!avatar) return false;
  if (avatar.includes("flaticon.com/512/149/149071")) return false;
  return true;
}

function hasMeaningfulName(user: AuthUser | null | undefined): boolean {
  const name = user?.name?.trim() ?? "";
  if (name.length < 2) return false;
  if (AUTO_NAME_PATTERN.test(name)) return false;
  return true;
}

function isStepComplete(stepId: string, user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  switch (stepId) {
    case "profile_photo":
      return hasCustomProfilePhoto(user);
    case "full_name":
      return hasMeaningfulName(user);
    case "email_verification":
      return Boolean(user.email?.trim() && user.isVerified);
    case "phone_verification":
      return Boolean(user.phone?.trim() && user.phoneVerified);
    case "date_of_birth":
      return Boolean(user.dateOfBirth);
    case "gender":
      return Boolean(user.gender?.trim());
    case "location":
      return Boolean(user.address?.trim());
    case "bio":
      return Boolean(user.bio?.trim());
    default:
      return false;
  }
}

/** Client fallback when API omits profileCompletion (offline / older server). */
export function buildProfileCompletionFromUser(
  user: AuthUser | null | undefined,
): ProfileCompletion | null {
  if (!user) return null;

  const steps = ALL_STEPS.map((step) => ({
    ...step,
    completed: isStepComplete(step.id, user),
  }));

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;
  const percentage = Math.round((completedCount / totalCount) * 100);
  const pendingSteps = steps.filter((s) => !s.completed);
  const nextStep = pendingSteps[0] ?? null;

  return {
    provider: user.provider,
    percentage,
    completedCount,
    totalCount,
    isComplete: percentage >= 100,
    steps,
    completedSteps: steps
      .filter((s) => s.completed)
      .map(({ id, label, description, route, field }) => ({
        id,
        label,
        description,
        route,
        field,
      })),
    pendingSteps: pendingSteps.map(({ id, label, description, route, field }) => ({
      id,
      label,
      description,
      route,
      field,
    })),
    nextStep: nextStep
      ? { id: nextStep.id, label: nextStep.label, description: nextStep.description, route: nextStep.route, field: nextStep.field }
      : null,
  };
}

export function resolveProfileCompletion(
  user: AuthUser | null | undefined,
  fromApi: ProfileCompletion | null | undefined,
): ProfileCompletion | null {
  if (fromApi) return fromApi;
  return buildProfileCompletionFromUser(user);
}
