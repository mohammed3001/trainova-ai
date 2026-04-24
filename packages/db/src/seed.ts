import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

const SKILLS = [
  { slug: 'fine-tuning', nameEn: 'Fine-tuning', nameAr: 'الضبط الدقيق', category: 'FINE_TUNING' },
  { slug: 'prompt-engineering', nameEn: 'Prompt Engineering', nameAr: 'هندسة الـ Prompt', category: 'PROMPT_ENGINEERING' },
  { slug: 'nlp', nameEn: 'Natural Language Processing', nameAr: 'معالجة اللغات الطبيعية', category: 'NLP' },
  { slug: 'computer-vision', nameEn: 'Computer Vision', nameAr: 'الرؤية الحاسوبية', category: 'COMPUTER_VISION' },
  { slug: 'data-labeling', nameEn: 'Data Labeling', nameAr: 'تصنيف البيانات', category: 'DATA_LABELING' },
  { slug: 'evaluation', nameEn: 'AI Evaluation', nameAr: 'تقييم الذكاء الاصطناعي', category: 'EVALUATION' },
  { slug: 'rlhf', nameEn: 'RLHF', nameAr: 'التعلّم المعزّز بالتغذية البشرية', category: 'RLHF' },
  { slug: 'safety-alignment', nameEn: 'Safety Alignment', nameAr: 'مواءمة الأمان', category: 'SAFETY_ALIGNMENT' },
  { slug: 'agents', nameEn: 'AI Agents', nameAr: 'وكلاء الذكاء الاصطناعي', category: 'AGENTS' },
  { slug: 'rag', nameEn: 'RAG Optimization', nameAr: 'تحسين RAG', category: 'RAG' },
  { slug: 'multilingual-tuning', nameEn: 'Multilingual Tuning', nameAr: 'الضبط متعدد اللغات', category: 'MULTILINGUAL' },
  { slug: 'conversation-design', nameEn: 'Conversation Design', nameAr: 'تصميم المحادثة', category: 'CONVERSATION_DESIGN' },
  { slug: 'ai-qa', nameEn: 'AI Quality Assurance', nameAr: 'ضمان الجودة', category: 'AI_QA' },
  { slug: 'dataset-preparation', nameEn: 'Dataset Preparation', nameAr: 'إعداد البيانات', category: 'DATASET_PREP' },
];

async function main() {
  console.log('🌱 Seeding Trainova AI database…');

  // Skills
  for (const s of SKILLS) {
    await prisma.skill.upsert({
      where: { slug: s.slug },
      update: {},
      create: s,
    });
  }
  console.log(`✔ Skills seeded (${SKILLS.length})`);

  // Plans
  await prisma.plan.upsert({
    where: { id: 'plan-company-free' },
    update: {},
    create: {
      id: 'plan-company-free',
      audience: 'COMPANY',
      tier: 'FREE',
      priceMonthly: 0,
      priceYearly: 0,
      featuresJson: { requests: 1, matching: false, support: 'community' },
    },
  });
  await prisma.plan.upsert({
    where: { id: 'plan-company-pro' },
    update: {},
    create: {
      id: 'plan-company-pro',
      audience: 'COMPANY',
      tier: 'PRO',
      priceMonthly: 9900,
      priceYearly: 99000,
      featuresJson: {
        requests: 10,
        matching: true,
        aiAssistant: true,
        commissionBps: 200,
        support: 'priority',
        featuredListings: 1,
      },
    },
  });
  await prisma.plan.upsert({
    where: { id: 'plan-company-enterprise' },
    update: {},
    create: {
      id: 'plan-company-enterprise',
      audience: 'COMPANY',
      tier: 'ENTERPRISE',
      priceMonthly: 49900,
      priceYearly: 499000,
      featuresJson: {
        requests: 'unlimited',
        matching: true,
        aiAssistant: true,
        teamSeats: 10,
        commissionBps: 100,
        support: 'dedicated',
        featuredListings: 'unlimited',
        sso: true,
        apiAccess: true,
      },
    },
  });
  await prisma.plan.upsert({
    where: { id: 'plan-trainer-basic' },
    update: {},
    create: {
      id: 'plan-trainer-basic',
      audience: 'TRAINER',
      tier: 'BASIC',
      priceMonthly: 0,
      priceYearly: 0,
      featuresJson: { visibility: 'standard', badge: null, workbench: false },
    },
  });
  await prisma.plan.upsert({
    where: { id: 'plan-trainer-verified' },
    update: {},
    create: {
      id: 'plan-trainer-verified',
      audience: 'TRAINER',
      tier: 'VERIFIED_PRO',
      priceMonthly: 1900,
      priceYearly: 19000,
      featuresJson: {
        visibility: 'boosted',
        badge: 'verified_pro',
        workbench: true,
        applicationsPerMonth: 50,
      },
    },
  });
  await prisma.plan.upsert({
    where: { id: 'plan-trainer-premium' },
    update: {},
    create: {
      id: 'plan-trainer-premium',
      audience: 'TRAINER',
      tier: 'PREMIUM_VISIBILITY',
      priceMonthly: 4900,
      priceYearly: 49000,
      featuresJson: {
        visibility: 'featured',
        badge: 'premium',
        workbench: true,
        applicationsPerMonth: 'unlimited',
        homepageFeature: true,
        priorityMatching: true,
      },
    },
  });
  console.log('✔ Plans seeded');

  // Super Admin
  await prisma.user.upsert({
    where: { email: 'admin@trainova.ai' },
    update: {},
    create: {
      email: 'admin@trainova.ai',
      name: 'Platform Admin',
      passwordHash: hashPassword('Admin12345!'),
      role: 'SUPER_ADMIN' satisfies UserRole,
      emailVerifiedAt: new Date(),
    },
  });
  console.log('✔ Super admin: admin@trainova.ai / Admin12345!');

  // Demo Company
  const companyOwner = await prisma.user.upsert({
    where: { email: 'owner@acme-ai.com' },
    update: {},
    create: {
      email: 'owner@acme-ai.com',
      name: 'Sara Lee',
      passwordHash: hashPassword('Company123!'),
      role: 'COMPANY_OWNER',
      emailVerifiedAt: new Date(),
    },
  });
  const company = await prisma.company.upsert({
    where: { slug: 'acme-ai' },
    update: {},
    create: {
      ownerId: companyOwner.id,
      name: 'Acme AI Labs',
      slug: 'acme-ai',
      country: 'United States',
      industry: 'AI Research',
      size: '50-200',
      description: 'Building safe and aligned foundation models for enterprise.',
      verified: true,
    },
  });
  console.log('✔ Demo company: owner@acme-ai.com / Company123!');

  // Demo Trainer
  const trainerUser = await prisma.user.upsert({
    where: { email: 'trainer@trainova.ai' },
    update: {},
    create: {
      email: 'trainer@trainova.ai',
      name: 'Omar Khalid',
      passwordHash: hashPassword('Trainer123!'),
      role: 'TRAINER',
      emailVerifiedAt: new Date(),
    },
  });
  const trainerProfile = await prisma.trainerProfile.upsert({
    where: { userId: trainerUser.id },
    update: {},
    create: {
      userId: trainerUser.id,
      slug: 'omar-khalid',
      headline: 'Senior LLM Fine-tuning & RLHF Specialist',
      bio: '7+ years training large language models for enterprise clients. Focus on RLHF, safety alignment, and domain tuning for healthcare and fintech.',
      country: 'United Arab Emirates',
      languages: ['en', 'ar'],
      timezone: 'Asia/Dubai',
      hourlyRateMin: 80,
      hourlyRateMax: 180,
      verified: true,
      linkedinUrl: 'https://linkedin.com/in/omar-khalid',
    },
  });

  const ftSkill = await prisma.skill.findUnique({ where: { slug: 'fine-tuning' } });
  const rlhfSkill = await prisma.skill.findUnique({ where: { slug: 'rlhf' } });
  const peSkill = await prisma.skill.findUnique({ where: { slug: 'prompt-engineering' } });
  if (ftSkill)
    await prisma.trainerSkill.upsert({
      where: { profileId_skillId: { profileId: trainerProfile.id, skillId: ftSkill.id } },
      update: {},
      create: { profileId: trainerProfile.id, skillId: ftSkill.id, level: 'EXPERT', yearsExperience: 7 },
    });
  if (rlhfSkill)
    await prisma.trainerSkill.upsert({
      where: { profileId_skillId: { profileId: trainerProfile.id, skillId: rlhfSkill.id } },
      update: {},
      create: { profileId: trainerProfile.id, skillId: rlhfSkill.id, level: 'ADVANCED', yearsExperience: 4 },
    });
  if (peSkill)
    await prisma.trainerSkill.upsert({
      where: { profileId_skillId: { profileId: trainerProfile.id, skillId: peSkill.id } },
      update: {},
      create: { profileId: trainerProfile.id, skillId: peSkill.id, level: 'EXPERT', yearsExperience: 5 },
    });
  console.log('✔ Demo trainer: trainer@trainova.ai / Trainer123!');

  // Demo Job Request
  const request = await prisma.jobRequest.upsert({
    where: { slug: 'fine-tune-healthcare-llm' },
    update: {},
    create: {
      companyId: company.id,
      slug: 'fine-tune-healthcare-llm',
      title: 'Fine-tune a healthcare-focused LLM with RLHF',
      description:
        'We need an experienced AI trainer to fine-tune an open-source LLM for clinical note summarization. Responsibilities: dataset curation, supervised fine-tuning, RLHF with domain experts, and evaluation against a held-out test set. Must understand HIPAA basics and medical jargon.',
      objective: 'Ship a fine-tuned checkpoint with ≥15% uplift on our held-out rubric within 8 weeks.',
      modelFamily: 'Llama 3.1 70B',
      industry: 'Healthcare',
      languages: ['en'],
      durationDays: 60,
      budgetMin: 15000,
      budgetMax: 40000,
      currency: 'USD',
      workType: 'REMOTE',
      status: 'OPEN',
      publishedAt: new Date(),
      skills: {
        create: [
          ...(ftSkill ? [{ skillId: ftSkill.id, required: true, minYears: 3 }] : []),
          ...(rlhfSkill ? [{ skillId: rlhfSkill.id, required: true, minYears: 2 }] : []),
        ],
      },
      questions: {
        create: [
          { prompt: 'Briefly describe a past healthcare AI project you led.', type: 'TEXT', required: true, order: 1 },
          {
            prompt: 'Which evaluation metrics would you prioritize here?',
            type: 'MCQ',
            options: ['BLEU', 'ROUGE', 'Expert rubric', 'Perplexity'],
            required: true,
            order: 2,
          },
        ],
      },
    },
  });
  console.log(`✔ Demo job request: ${request.title}`);

  // Demo test
  const existingTest = await prisma.test.findFirst({ where: { requestId: request.id } });
  if (!existingTest) {
    await prisma.test.create({
      data: {
        requestId: request.id,
        title: 'Fine-tuning + RLHF Screening',
        description: 'A short screening to validate core concepts.',
        timeLimitMin: 30,
        passingScore: 60,
        scoringMode: 'HYBRID',
        tasks: {
          create: [
            {
              prompt: 'Which loss function is typically used in supervised fine-tuning of causal LLMs?',
              type: 'MCQ',
              options: ['MSE', 'Cross-Entropy', 'Hinge', 'KL Divergence'],
              answerKey: 'Cross-Entropy',
              maxScore: 10,
              order: 1,
            },
            {
              prompt:
                'In 3–5 sentences, describe how you would design a reward model training pipeline for a healthcare assistant, highlighting safety considerations.',
              type: 'TEXT',
              maxScore: 20,
              order: 2,
            },
          ],
        },
      },
    });
    console.log('✔ Demo test created');
  }

  // Homepage CMS pages
  const pages: { slug: string; locale: string; title: string; content: string }[] = [
    {
      slug: 'about',
      locale: 'en',
      title: 'About Trainova AI',
      content: 'Trainova AI is the global marketplace and evaluation platform for AI training talent.',
    },
    {
      slug: 'about',
      locale: 'ar',
      title: 'عن منصة Trainova AI',
      content: 'Trainova AI هي المنصة العالمية لتوظيف واختبار مدربي نماذج الذكاء الاصطناعي.',
    },
  ];
  for (const p of pages) {
    await prisma.page.upsert({
      where: { slug_locale: { slug: p.slug, locale: p.locale } },
      update: {},
      create: p,
    });
  }
  console.log('✔ CMS pages seeded');

  console.log('\n✅ Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
