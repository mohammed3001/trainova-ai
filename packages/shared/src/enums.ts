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

/**
 * MVP transition matrix for the company-facing application workflow.
 * Keys are the current status; values are the set of statuses a company
 * owner may transition to. Terminal states (ACCEPTED, REJECTED, WITHDRAWN)
 * have an empty allowed set. Values that aren't exposed in the MVP UI
 * (TEST_ASSIGNED/TEST_SUBMITTED/INTERVIEW/OFFERED) are intentionally
 * omitted from the allowed transitions for now — adding them later is a
 * pure data change with no schema impact.
 */
export const APPLICATION_STATUS_TRANSITIONS: Record<
  ApplicationStatus,
  readonly ApplicationStatus[]
> = {
  APPLIED: ['SHORTLISTED', 'TEST_ASSIGNED', 'ACCEPTED', 'REJECTED'],
  SHORTLISTED: ['APPLIED', 'TEST_ASSIGNED', 'ACCEPTED', 'REJECTED'],
  // TEST_ASSIGNED → TEST_SUBMITTED is performed by the trainer on submit,
  // not by the company owner, but it's listed here so the transition matrix
  // is a single source of truth. The controller layer enforces the actor role.
  TEST_ASSIGNED: ['TEST_SUBMITTED', 'REJECTED', 'WITHDRAWN'],
  TEST_SUBMITTED: ['ACCEPTED', 'REJECTED'],
  INTERVIEW: [],
  OFFERED: [],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
} as const;

export function canTransitionApplicationStatus(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  if (from === to) return false;
  return APPLICATION_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Namespaced action strings written to AuditLog.action. Kept as a const
 * so API and web UI (history page) agree on the exact strings.
 */
export const AUDIT_ACTIONS = {
  APPLICATION_STATUS_CHANGED: 'APPLICATION_STATUS_CHANGED',
  ASSET_UPLOADED: 'ASSET_UPLOADED',
  ASSET_DELETED: 'ASSET_DELETED',
  TEST_ATTEMPT_GRADED: 'TEST_ATTEMPT_GRADED',
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

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
