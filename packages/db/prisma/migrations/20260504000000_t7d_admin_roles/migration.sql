-- T7.D: Granular admin roles. Adds 5 specialized admin tiers so the
-- platform owner can delegate without granting full ADMIN.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MODERATOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FINANCE';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPPORT';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CONTENT_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADS_MANAGER';
