export type ProfileCompletionStep = {
  id: string;
  label: string;
  description: string;
  route: string;
  field: string;
  completed: boolean;
};

export type ProfileCompletionNextStep = {
  id: string;
  label: string;
  description: string;
  route: string;
  field: string;
};

export type ProfileCompletion = {
  provider?: string;
  percentage: number;
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
  steps: ProfileCompletionStep[];
  completedSteps: ProfileCompletionNextStep[];
  pendingSteps: ProfileCompletionNextStep[];
  nextStep: ProfileCompletionNextStep | null;
};
