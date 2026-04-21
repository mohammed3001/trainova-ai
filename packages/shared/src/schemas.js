"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startConversationSchema = exports.sendMessageSchema = exports.updateCompanySchema = exports.updateTrainerProfileSchema = exports.applyToRequestSchema = exports.createJobRequestSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8).max(128),
    name: zod_1.z.string().min(1).max(120),
    role: zod_1.z.enum(['COMPANY_OWNER', 'TRAINER']),
    locale: zod_1.z.enum(['en', 'ar']).optional().default('en'),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
exports.createJobRequestSchema = zod_1.z.object({
    title: zod_1.z.string().min(5).max(200),
    description: zod_1.z.string().min(20),
    objective: zod_1.z.string().max(2000).optional(),
    modelFamily: zod_1.z.string().max(80).optional(),
    industry: zod_1.z.string().max(80).optional(),
    languages: zod_1.z.array(zod_1.z.string()).max(20).default([]),
    skills: zod_1.z.array(zod_1.z.string()).max(30).default([]),
    durationDays: zod_1.z.number().int().min(1).max(365).optional(),
    budgetMin: zod_1.z.number().int().nonnegative().optional(),
    budgetMax: zod_1.z.number().int().nonnegative().optional(),
    currency: zod_1.z.string().length(3).default('USD'),
    workType: zod_1.z.enum(['REMOTE', 'ONSITE', 'HYBRID']).default('REMOTE'),
    confidentialityLevel: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH']).default('LOW'),
});
exports.applyToRequestSchema = zod_1.z.object({
    requestId: zod_1.z.string().cuid(),
    coverLetter: zod_1.z.string().max(5000).optional(),
    proposedRate: zod_1.z.number().int().nonnegative().optional(),
    proposedTimelineDays: zod_1.z.number().int().min(1).max(365).optional(),
});
exports.updateTrainerProfileSchema = zod_1.z.object({
    headline: zod_1.z.string().max(160).optional(),
    bio: zod_1.z.string().max(4000).optional(),
    country: zod_1.z.string().max(80).optional(),
    languages: zod_1.z.array(zod_1.z.string()).max(20).optional(),
    timezone: zod_1.z.string().max(80).optional(),
    hourlyRateMin: zod_1.z.number().int().nonnegative().optional(),
    hourlyRateMax: zod_1.z.number().int().nonnegative().optional(),
    linkedinUrl: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    githubUrl: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    websiteUrl: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    skills: zod_1.z.array(zod_1.z.string()).max(40).optional(),
});
exports.updateCompanySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(200).optional(),
    websiteUrl: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    country: zod_1.z.string().max(80).optional(),
    industry: zod_1.z.string().max(80).optional(),
    size: zod_1.z.string().max(40).optional(),
    description: zod_1.z.string().max(4000).optional(),
    logoUrl: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
});
exports.sendMessageSchema = zod_1.z.object({
    conversationId: zod_1.z.string().cuid(),
    body: zod_1.z.string().min(1).max(5000),
});
exports.startConversationSchema = zod_1.z.object({
    otherUserId: zod_1.z.string().cuid(),
    requestId: zod_1.z.string().cuid().optional(),
});
