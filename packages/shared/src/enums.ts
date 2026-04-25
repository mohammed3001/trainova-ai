export const UserRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'MODERATOR',
  'FINANCE',
  'SUPPORT',
  'CONTENT_MANAGER',
  'ADS_MANAGER',
  'COMPANY_OWNER',
  'COMPANY_MEMBER',
  'TRAINER',
] as const;
export type UserRole = (typeof UserRoles)[number];

/**
 * Admin role groups (T7.D). Each group is the set of roles that may
 * access a specific admin domain. SUPER_ADMIN and ADMIN have access to
 * every group except SUPER_ONLY; specialized roles only see their own
 * surface.
 *
 * Use these tuples in @Roles(...ADMIN_ROLE_GROUPS.FINANCE) on the API
 * side so the policy is centralized — adding a new role only requires
 * editing this file.
 */
export const ADMIN_ROLE_GROUPS = {
  /** Anything an admin can do (users mgmt, broad reads). */
  ALL: ['SUPER_ADMIN', 'ADMIN'] as const,
  /** Reports, message redaction, conversation locks, dispute review. */
  MODERATION: ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'] as const,
  /** Finance dashboard, payouts, invoices, plans, refunds. */
  FINANCE: ['SUPER_ADMIN', 'ADMIN', 'FINANCE'] as const,
  /** Support inbox, contact submissions, user assistance. */
  SUPPORT: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'MODERATOR'] as const,
  /** Pages, articles, FAQ, email templates, contract templates, blog. */
  CONTENT: ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER'] as const,
  /** Ad campaigns approval, placements, sponsorship pricing. */
  ADS: ['SUPER_ADMIN', 'ADMIN', 'ADS_MANAGER'] as const,
  /** Verification reviews (identity, business). */
  VERIFICATION: ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SUPPORT'] as const,
  /** Settings, secrets, integrations — most sensitive. */
  SUPER_ONLY: ['SUPER_ADMIN'] as const,
} as const;
export type AdminRoleGroup = keyof typeof ADMIN_ROLE_GROUPS;

/**
 * Roles that have any kind of admin surface in the dashboard. Useful for
 * the web layout to decide whether to show /admin nav at all.
 */
export const ADMIN_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MODERATOR',
  'FINANCE',
  'SUPPORT',
  'CONTENT_MANAGER',
  'ADS_MANAGER',
] as const satisfies readonly UserRole[];
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** True if the role has any admin section visible. */
export function isAdminRole(role: UserRole | null | undefined): role is AdminRole {
  if (!role) return false;
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

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
  VERIFICATION_REQUESTED: 'VERIFICATION_REQUESTED',
  VERIFICATION_APPROVED: 'VERIFICATION_APPROVED',
  VERIFICATION_REJECTED: 'VERIFICATION_REJECTED',
  ADMIN_USER_ROLE_CHANGED: 'ADMIN_USER_ROLE_CHANGED',
  ADMIN_USER_STATUS_CHANGED: 'ADMIN_USER_STATUS_CHANGED',
  ADMIN_USER_EMAIL_MARKED_VERIFIED: 'ADMIN_USER_EMAIL_MARKED_VERIFIED',
  ADMIN_USER_VERIFY_RESEND: 'ADMIN_USER_VERIFY_RESEND',
  ADMIN_USER_PASSWORD_RESET_SENT: 'ADMIN_USER_PASSWORD_RESET_SENT',
  ADMIN_COMPANY_VERIFIED: 'ADMIN_COMPANY_VERIFIED',
  ADMIN_COMPANY_UNVERIFIED: 'ADMIN_COMPANY_UNVERIFIED',
  ADMIN_TRAINER_VERIFIED: 'ADMIN_TRAINER_VERIFIED',
  ADMIN_TRAINER_UNVERIFIED: 'ADMIN_TRAINER_UNVERIFIED',
  // T5.B — operations (requests / tests / chat / moderation)
  ADMIN_REQUEST_STATUS_CHANGED: 'ADMIN_REQUEST_STATUS_CHANGED',
  ADMIN_REQUEST_FEATURED: 'ADMIN_REQUEST_FEATURED',
  ADMIN_REQUEST_UNFEATURED: 'ADMIN_REQUEST_UNFEATURED',
  ADMIN_CONVERSATION_LOCKED: 'ADMIN_CONVERSATION_LOCKED',
  ADMIN_CONVERSATION_UNLOCKED: 'ADMIN_CONVERSATION_UNLOCKED',
  ADMIN_MESSAGE_REDACTED: 'ADMIN_MESSAGE_REDACTED',
  REPORT_SUBMITTED: 'REPORT_SUBMITTED',
  ADMIN_REPORT_STATUS_CHANGED: 'ADMIN_REPORT_STATUS_CHANGED',
  ADMIN_REPORT_RESOLVED: 'ADMIN_REPORT_RESOLVED',
  // T5.C — CMS (pages, articles, categories, FAQ) + feature flags
  CMS_PAGE_CREATED: 'CMS_PAGE_CREATED',
  CMS_PAGE_UPDATED: 'CMS_PAGE_UPDATED',
  CMS_PAGE_DELETED: 'CMS_PAGE_DELETED',
  CMS_CATEGORY_CREATED: 'CMS_CATEGORY_CREATED',
  CMS_CATEGORY_UPDATED: 'CMS_CATEGORY_UPDATED',
  CMS_CATEGORY_DELETED: 'CMS_CATEGORY_DELETED',
  CMS_ARTICLE_CREATED: 'CMS_ARTICLE_CREATED',
  CMS_ARTICLE_UPDATED: 'CMS_ARTICLE_UPDATED',
  CMS_ARTICLE_DELETED: 'CMS_ARTICLE_DELETED',
  CMS_FAQ_CREATED: 'CMS_FAQ_CREATED',
  CMS_FAQ_UPDATED: 'CMS_FAQ_UPDATED',
  CMS_FAQ_DELETED: 'CMS_FAQ_DELETED',
  FEATURE_FLAG_CREATED: 'FEATURE_FLAG_CREATED',
  FEATURE_FLAG_UPDATED: 'FEATURE_FLAG_UPDATED',
  FEATURE_FLAG_DELETED: 'FEATURE_FLAG_DELETED',
  SETTING_UPDATED: 'SETTING_UPDATED',
  SETTING_DELETED: 'SETTING_DELETED',
  // T5.E — reviews + disputes
  REVIEW_SUBMITTED: 'REVIEW_SUBMITTED',
  REVIEW_DELETED: 'REVIEW_DELETED',
  DISPUTE_RAISED: 'DISPUTE_RAISED',
  DISPUTE_WITHDRAWN: 'DISPUTE_WITHDRAWN',
  ADMIN_DISPUTE_STATUS_CHANGED: 'ADMIN_DISPUTE_STATUS_CHANGED',
  ADMIN_DISPUTE_RESOLVED: 'ADMIN_DISPUTE_RESOLVED',
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const UserStatuses = ['ACTIVE', 'SUSPENDED', 'PENDING'] as const;
export type UserStatus = (typeof UserStatuses)[number];

export const VerificationStatuses = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type VerificationStatus = (typeof VerificationStatuses)[number];

export const VerificationTargetTypes = ['COMPANY', 'TRAINER'] as const;
export type VerificationTargetType = (typeof VerificationTargetTypes)[number];

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

export const Locales = ['en', 'ar', 'fr', 'es'] as const;
export type Locale = (typeof Locales)[number];

// Email templates are only authored in English + Arabic. Fallback other locales
// to English so sends do not fail for fr/es users until templates are authored.
export const EmailLocales = ['en', 'ar'] as const;
export type EmailLocale = (typeof EmailLocales)[number];
export function toEmailLocale(l: Locale | string | null | undefined): EmailLocale {
  return l === 'ar' ? 'ar' : 'en';
}
