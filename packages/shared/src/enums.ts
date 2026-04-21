export const UserRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPANY_OWNER',
  'COMPANY_MEMBER',
  'TRAINER',
] as const;
export type UserRole = (typeof UserRoles)[number];

export const JobRequestStatuses = [
  'DRAFT',
  'OPEN',
  'IN_REVIEW',
  'CLOSED',
  'ARCHIVED',
] as const;
export type JobRequestStatus = (typeof JobRequestStatuses)[number];

export const ApplicationStatuses = [
  'APPLIED',
  'SHORTLISTED',
  'TEST_ASSIGNED',
  'TEST_SUBMITTED',
  'INTERVIEW',
  'OFFERED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type ApplicationStatus = (typeof ApplicationStatuses)[number];

export const TestTaskTypes = [
  'MCQ',
  'TEXT',
  'CODE',
  'PROMPT_TUNE',
  'LABEL',
  'LIVE_PROMPT',
  'WORKFLOW',
] as const;
export type TestTaskType = (typeof TestTaskTypes)[number];

export const SkillCategories = [
  'FINE_TUNING',
  'PROMPT_ENGINEERING',
  'NLP',
  'COMPUTER_VISION',
  'DATA_LABELING',
  'EVALUATION',
  'RLHF',
  'SAFETY_ALIGNMENT',
  'AGENTS',
  'RAG',
  'MULTILINGUAL',
  'CONVERSATION_DESIGN',
  'AI_QA',
  'DATASET_PREP',
] as const;
export type SkillCategory = (typeof SkillCategories)[number];

export const Locales = ['en', 'ar'] as const;
export type Locale = (typeof Locales)[number];
