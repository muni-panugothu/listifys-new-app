const DEFAULT_FLATICON_AVATAR =
  "https://cdn-icons-png.flaticon.com/512/149/149071.png";

const AUTO_NAME_PATTERN = /^User \d{4}$/i;

const STEP_CATALOG = {
  profile_photo: {
    id: "profile_photo",
    label: "Add Profile Photo",
    description: "Upload a profile picture",
    route: "/profile-details-edit",
    field: "photo",
  },
  full_name: {
    id: "full_name",
    label: "Complete Full Name",
    description: "Add your full name",
    route: "/profile-details-edit",
    field: "name",
  },
  email_verification: {
    id: "email_verification",
    label: "Verify Email",
    description: "Verify your email address",
    route: "/change-email",
    field: "email",
  },
  phone_verification: {
    id: "phone_verification",
    label: "Verify Phone",
    description: "Verify your phone number",
    route: "/change-phone-primary",
    field: "phone",
  },
  date_of_birth: {
    id: "date_of_birth",
    label: "Add Date of Birth",
    description: "Add your date of birth",
    route: "/profile-details-edit",
    field: "dateOfBirth",
  },
  gender: {
    id: "gender",
    label: "Select Gender",
    description: "Select your gender",
    route: "/profile-details-edit",
    field: "gender",
  },
  location: {
    id: "location",
    label: "Add Location",
    description: "Add your location",
    route: "/profile-details-edit",
    field: "address",
  },
  bio: {
    id: "bio",
    label: "Write Bio",
    description: "Write a short bio",
    route: "/profile-details-edit",
    field: "bio",
  },
};

const ALL_STEP_ORDER = [
  "profile_photo",
  "full_name",
  "email_verification",
  "phone_verification",
  "date_of_birth",
  "gender",
  "location",
  "bio",
];

function resolveProviderKey(user) {
  const provider = String(user?.provider ?? "").toLowerCase();
  if (provider === "phone") return "phone";
  if (provider === "google") return "google";
  if (provider === "local") return "local";
  return "default";
}

function hasCustomProfilePhoto(user) {
  if (user?.profileImageKey) return true;
  if (user?.profileImage && String(user.profileImage).trim()) return true;
  if (user?.googleProfileImage && String(user.googleProfileImage).trim()) {
    return true;
  }
  const avatar = user?.avatar ? String(user.avatar).trim() : "";
  if (!avatar) return false;
  if (avatar.includes("flaticon.com/512/149/149071")) return false;
  if (avatar === DEFAULT_FLATICON_AVATAR) return false;
  return true;
}

function hasMeaningfulName(user) {
  const name = String(user?.name ?? "").trim();
  if (name.length < 2) return false;
  if (AUTO_NAME_PATTERN.test(name)) return false;
  return true;
}

function isEmailStepComplete(user) {
  const email = String(user?.email ?? "").trim();
  if (!email) return false;
  return Boolean(user?.isVerified);
}

function isPhoneStepComplete(user) {
  const phone = String(user?.phone ?? "").trim();
  if (!phone) return false;
  return Boolean(user?.phoneVerified);
}

function isDateOfBirthComplete(user) {
  return Boolean(user?.dateOfBirth);
}

function isGenderComplete(user) {
  return String(user?.gender ?? "").trim().length > 0;
}

function isLocationComplete(user) {
  return String(user?.address ?? "").trim().length > 0;
}

function isBioComplete(user) {
  return String(user?.bio ?? "").trim().length > 0;
}

const STEP_EVALUATORS = {
  profile_photo: hasCustomProfilePhoto,
  full_name: hasMeaningfulName,
  email_verification: isEmailStepComplete,
  phone_verification: isPhoneStepComplete,
  date_of_birth: isDateOfBirthComplete,
  gender: isGenderComplete,
  location: isLocationComplete,
  bio: isBioComplete,
};

function mapStep(definitionId, user) {
  const definition = STEP_CATALOG[definitionId];
  if (!definition) return null;

  const evaluate = STEP_EVALUATORS[definitionId];
  const completed = evaluate ? evaluate(user) : false;

  return { ...definition, completed };
}

function buildProfileCompletion(user) {
  const provider = resolveProviderKey(user);
  const steps = ALL_STEP_ORDER.map((id) => mapStep(id, user)).filter(Boolean);

  const completedCount = steps.filter((step) => step.completed).length;
  const totalCount = steps.length;
  const percentage =
    totalCount === 0 ? 100 : Math.round((completedCount / totalCount) * 100);

  const pendingSteps = steps.filter((step) => !step.completed);
  const nextStep = pendingSteps[0] ?? null;

  return {
    provider,
    percentage,
    completedCount,
    totalCount,
    isComplete: percentage >= 100,
    steps,
    completedSteps: steps
      .filter((step) => step.completed)
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
      ? {
          id: nextStep.id,
          label: nextStep.label,
          description: nextStep.description,
          route: nextStep.route,
          field: nextStep.field,
        }
      : null,
  };
}

module.exports = {
  STEP_CATALOG,
  ALL_STEP_ORDER,
  buildProfileCompletion,
};
