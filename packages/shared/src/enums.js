"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Locales = exports.SkillCategories = exports.TestTaskTypes = exports.ApplicationStatuses = exports.JobRequestStatuses = exports.UserRoles = void 0;
exports.UserRoles = [
    'SUPER_ADMIN',
    'ADMIN',
    'COMPANY_OWNER',
    'COMPANY_MEMBER',
    'TRAINER',
];
exports.JobRequestStatuses = [
    'DRAFT',
    'OPEN',
    'IN_REVIEW',
    'CLOSED',
    'ARCHIVED',
];
exports.ApplicationStatuses = [
    'APPLIED',
    'SHORTLISTED',
    'TEST_ASSIGNED',
    'TEST_SUBMITTED',
    'INTERVIEW',
    'OFFERED',
    'ACCEPTED',
    'REJECTED',
    'WITHDRAWN',
];
exports.TestTaskTypes = [
    'MCQ',
    'TEXT',
    'CODE',
    'PROMPT_TUNE',
    'LABEL',
    'LIVE_PROMPT',
    'WORKFLOW',
];
exports.SkillCategories = [
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
];
exports.Locales = ['en', 'ar'];
