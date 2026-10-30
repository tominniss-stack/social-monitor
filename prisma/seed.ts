import {
  PrismaClient,
  Platform,
  TriageStatus,
  PriorityLevel,
  CommentCategory,
  Sentiment,
  WorkspaceRole,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Clean existing records
  await prisma.contentCluster.deleteMany();
  await prisma.triageOverride.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.llmUsageDay.deleteMany();
  await prisma.webhookEventLog.deleteMany();
  await prisma.commentTriage.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.platformAccount.deleteMany();
  await prisma.brandVoiceConfig.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.workspace.deleteMany();

  // 1b. Default workspace + dev membership (D-17)
  const workspace = await prisma.workspace.create({
    data: { name: 'Aether Agency', slug: 'default' },
  });
  await prisma.membership.create({
    data: {
      workspaceId: workspace.id,
      email: process.env.DEV_USER_EMAIL || 'dev@localhost',
      role: WorkspaceRole.ADMIN,
    },
  });
  console.log('✓ Default workspace + ADMIN membership seeded');

  // 2. Default Brand Voice Configuration
  const brandVoice = await prisma.brandVoiceConfig.create({
    data: {
      id: 'default',
      workspaceId: workspace.id,
      brandName: 'Aether AI',
      toneGuidelines:
        'Professional yet conversational, authoritative, helpful, and empathetic. Always use UK English spelling (e.g. prioritised, categorised, analyse). Never make unverified pricing promises or commit to unreleased feature deadlines publicly. Direct commercial queries to the demo booking link.',
      prohibitedPhrases: [
        'guaranteed 10X ROI',
        'our competitors suck',
        'cheapest in the industry',
        'no refunds under any circumstance',
      ],
      signOffStyle: 'Best regards, the Aether Community Team',
      escalationRules:
        'Escalate immediately if user mentions legal proceedings, critical security vulnerabilities, GDPR data deletion demands, or billing discrepancies over £500.',
    },
  });
  console.log('✓ Brand voice config seeded');

  // 3. Platform Accounts
  const fbAccount = await prisma.platformAccount.create({
    data: {
      platform: Platform.FACEBOOK,
      externalAccountId: 'fb_page_1092837465',
      name: 'Aether AI UK',
      handle: '@AetherAI_UK',
      avatarUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      isActive: true,
      lastSyncedAt: new Date(),
      workspaceId: workspace.id,
    },
  });

  const igAccount = await prisma.platformAccount.create({
    data: {
      platform: Platform.INSTAGRAM,
      externalAccountId: 'ig_biz_9928374102',
      name: 'Aether AI Official',
      handle: '@aetherai.io',
      avatarUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      isActive: true,
      lastSyncedAt: new Date(),
      workspaceId: workspace.id,
    },
  });
  console.log('✓ Platform accounts seeded');

  // 4. Posts (2 organic, 2 paid dark ad posts)
  const post1 = await prisma.post.create({
    data: {
      accountId: igAccount.id,
      externalPostId: 'ig_post_88301',
      caption:
        'Excited to launch our new Automated Workflow engine for enterprise teams! Cut your reporting overhead in half with centralised intelligence. What workflow takes the most time in your day? Drop it below 👇',
      permalink: 'https://instagram.com/p/DB001',
      mediaType: 'IMAGE',
      mediaUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=80',
      isPaidAd: false,
      publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  });

  const post2 = await prisma.post.create({
    data: {
      accountId: igAccount.id,
      externalPostId: 'ig_ad_88302',
      effectiveStoryId: 'story_dark_99201',
      caption:
        'Stop wasting 15+ hours a week triaging cross-channel customer comments. Aether AI unifies Meta engagement into one prioritised inbox with human-in-the-loop AI drafts. Book an exclusive demo today.',
      permalink: 'https://instagram.com/p/DB002_ad',
      mediaType: 'VIDEO',
      mediaUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&auto=format&fit=crop&q=80',
      isPaidAd: true,
      publishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  });

  const post3 = await prisma.post.create({
    data: {
      accountId: fbAccount.id,
      externalPostId: 'fb_post_77201',
      caption:
        'We just published our 2026 Social Intelligence Benchmark report: 73% of brand purchase intent comments go unanswered after 2 hours. Here is how leading EMEA brands are fixing their SLAs without burning out community teams.',
      permalink: 'https://facebook.com/AetherAI/posts/77201',
      mediaType: 'CAROUSEL_ALBUM',
      mediaUrl: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=600&auto=format&fit=crop&q=80',
      isPaidAd: false,
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });

  const post4 = await prisma.post.create({
    data: {
      accountId: fbAccount.id,
      externalPostId: 'fb_ad_77202',
      effectiveStoryId: 'fb_dark_story_55102',
      caption:
        'Attention CMOs & Community Directors: Cut your agency response overhead by 60% with sovereign on-premise LLM routing. Compliant with GDPR & Meta BUC rate limits.',
      permalink: 'https://facebook.com/AetherAI/posts/77202_ad',
      mediaType: 'IMAGE',
      mediaUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&auto=format&fit=crop&q=80',
      isPaidAd: true,
      publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    },
  });
  console.log('✓ 4 sample posts seeded (2 organic, 2 dark ad posts)');

  // 5. Comments & Triage Records
  const commentsData = [
    // 1. High commercial intent on Paid Dark Ad (IG) -> P1_CRITICAL, LEAD_ENQUIRY
    {
      postId: post2.id,
      externalCommentId: 'comm_ig_001',
      authorName: 'Charlotte Davies',
      authorUsername: 'charlotte_marketing',
      authorExternalId: 'ext_user_401',
      body: 'What is the pricing model for a team of 12 community managers? We manage 5 brands across the UK and need an enterprise quote ASAP.',
      publishedAt: new Date(Date.now() - 15 * 60 * 1000),
      triage: {
        status: TriageStatus.DRAFT_READY,
        priority: PriorityLevel.P1_CRITICAL,
        category: CommentCategory.LEAD_ENQUIRY,
        sentiment: Sentiment.POSITIVE,
        requiresHumanReply: true,
        aiReasoning: 'Explicit enterprise purchasing enquiry from a multi-brand marketing manager with 12 seats requested.',
        topicTags: ['pricing', 'enterprise', 'multi-brand', 'agency-licensing'],
        aiDraftReply:
          'Hello Charlotte! Our enterprise tier offers custom workspace provisioning for multi-brand agencies with unlimited seats. I have sent details to our solution team—feel free to book a 15-minute briefing directly via aetherai.io/book-demo or send us a quick note at enterprise@aetherai.io.',
      },
    },
    // 2. Urgent Complaint / Support on FB Post -> P1_CRITICAL, COMPLAINT_SUPPORT
    {
      postId: post3.id,
      externalCommentId: 'comm_fb_002',
      authorName: 'Liam Patterson',
      authorUsername: 'liampatterson_tech',
      authorExternalId: 'ext_user_402',
      body: 'Our webhook integration disconnected 2 hours ago and we are missing Instagram comment syncs. Ticket #4829 has had zero updates. Please fix this urgently!',
      publishedAt: new Date(Date.now() - 45 * 60 * 1000),
      triage: {
        status: TriageStatus.ESCALATED,
        priority: PriorityLevel.P1_CRITICAL,
        category: CommentCategory.COMPLAINT_SUPPORT,
        sentiment: Sentiment.NEGATIVE,
        requiresHumanReply: true,
        aiReasoning: 'Active customer reporting a critical service outage with an open support ticket #4829 requiring urgent engineering attention.',
        topicTags: ['outage', 'webhook-sync', 'sla-breach', 'ticket-4829'],
        aiDraftReply:
          'Hi Liam, we sincerely apologise for the disruption. Our on-call engineering team has been notified of ticket #4829 and is actively inspecting the Meta token refresh pipeline right now. A senior engineer will follow up directly in your ticket thread within the next 15 minutes.',
      },
    },
    // 3. Product Feature Question on Paid FB Ad -> P2_HIGH, PRODUCT_QUESTION
    {
      postId: post4.id,
      externalCommentId: 'comm_fb_003',
      authorName: 'Dr. Oliver Scott',
      authorUsername: 'oscott_phd',
      authorExternalId: 'ext_user_403',
      body: 'Does your LLM routing support on-premise Ollama / Llama-3 instances or does all data transit through OpenAI cloud APIs? We have strict banking sector data sovereignty mandates.',
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      triage: {
        status: TriageStatus.DRAFT_READY,
        priority: PriorityLevel.P2_HIGH,
        category: CommentCategory.PRODUCT_QUESTION,
        sentiment: Sentiment.NEUTRAL,
        requiresHumanReply: true,
        aiReasoning: 'Detailed compliance and architecture query regarding data sovereignty and on-premise model support for financial services.',
        topicTags: ['data-sovereignty', 'on-premise', 'llama-3', 'compliance'],
        aiDraftReply:
          'Hello Oliver! Yes, Aether AI supports private VPC and on-premise deployments connecting to local OpenAI-compatible endpoints such as vLLM and Ollama, ensuring zero external data leakage for regulated industries. Would you like a copy of our architecture security whitepaper?',
      },
    },
    // 4. Product Question on IG Organic Post -> P2_HIGH, PRODUCT_QUESTION
    {
      postId: post1.id,
      externalCommentId: 'comm_ig_004',
      authorName: 'Sophie Bennett',
      authorUsername: 'soph_socials',
      authorExternalId: 'ext_user_404',
      body: 'Can this automatically distinguish between organic comments and comments left on dark paid ads? We frequently run boosting campaigns.',
      publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      triage: {
        status: TriageStatus.NEEDS_REPLY,
        priority: PriorityLevel.P2_HIGH,
        category: CommentCategory.PRODUCT_QUESTION,
        sentiment: Sentiment.NEUTRAL,
        requiresHumanReply: true,
        aiReasoning: 'Prospective user asking about dark ad post ingestion vs organic post tracking capabilities.',
        topicTags: ['dark-ads', 'effective_story_id', 'boosting', 'meta-ads'],
        aiDraftReply:
          'Hi Sophie! Absolutely. We query the Meta Marketing API to detect effective_story_id on all active ad sets, so your dark post comments appear alongside organic feed interactions with a distinct "Paid Ad" badge.',
      },
    },
    // 5. Praise on IG Organic Post -> P3_STANDARD, PRAISE (Answered via Dashboard)
    {
      postId: post1.id,
      externalCommentId: 'comm_ig_005',
      authorName: 'Marcus Evans',
      authorUsername: 'marcus_creative',
      authorExternalId: 'ext_user_405',
      body: 'The speed of this classification is incredible! Tested the trial yesterday and our response time dropped to under 5 minutes.',
      publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      triage: {
        status: TriageStatus.ANSWERED,
        priority: PriorityLevel.P3_STANDARD,
        category: CommentCategory.PRAISE,
        sentiment: Sentiment.POSITIVE,
        requiresHumanReply: false,
        aiReasoning: 'Enthusiastic customer testimonial highlighting improved response speed.',
        topicTags: ['praise', 'response-speed', 'customer-love'],
        aiDraftReply: 'Thank you so much Marcus! Thrilled to hear the team is seeing such rapid gains in response velocity 🚀',
        respondedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        respondedBy: 'Community Manager (Dashboard)',
      },
    },
    // 6. Answered via Native App (Instagram mobile app reply sync) -> P2_HIGH, ANSWERED
    {
      postId: post2.id,
      externalCommentId: 'comm_ig_006',
      authorName: 'Elena Rostova',
      authorUsername: 'elena_growth',
      authorExternalId: 'ext_user_406',
      body: 'Is there a Zapier or Make.com integration available to pipe classified leads into our HubSpot CRM?',
      publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      triage: {
        status: TriageStatus.ANSWERED,
        priority: PriorityLevel.P2_HIGH,
        category: CommentCategory.PRODUCT_QUESTION,
        sentiment: Sentiment.NEUTRAL,
        requiresHumanReply: true,
        aiReasoning: 'Integration enquiry regarding HubSpot sync via Zapier/Make.',
        topicTags: ['hubspot', 'zapier', 'crm-sync', 'integration'],
        aiDraftReply: 'Hi Elena! Yes, we offer native webhooks and a pre-built Zapier app to push LEAD_ENQUIRY comments straight to HubSpot.',
        respondedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        respondedBy: 'Native App (Instagram Mobile)',
      },
    },
    // 7. General Chat on FB Post -> P3_STANDARD, GENERAL_CHAT
    {
      postId: post3.id,
      externalCommentId: 'comm_fb_007',
      authorName: 'George Harrison',
      authorUsername: 'george_h',
      authorExternalId: 'ext_user_407',
      body: '@sarah_jenkins check page 4 of this report, matches exactly what we discussed in yesterday\'s leadership standup!',
      publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      triage: {
        status: TriageStatus.UNREAD,
        priority: PriorityLevel.P3_STANDARD,
        category: CommentCategory.GENERAL_CHAT,
        sentiment: Sentiment.NEUTRAL,
        requiresHumanReply: false,
        aiReasoning: 'Friend mention tagging a colleague about the benchmark report content.',
        topicTags: ['user-tag', 'peer-share', 'benchmark-report'],
        aiDraftReply: null,
      },
    },
    // 8. Lead Enquiry on Paid FB Ad -> P1_CRITICAL, LEAD_ENQUIRY
    {
      postId: post4.id,
      externalCommentId: 'comm_fb_008',
      authorName: 'Victoria Sterling',
      authorUsername: 'v_sterling_agency',
      authorExternalId: 'ext_user_408',
      body: 'Can we white-label this dashboard for our 8 client accounts under our agency branding? Need pricing for white-label reseller.',
      publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
      triage: {
        status: TriageStatus.DRAFT_READY,
        priority: PriorityLevel.P1_CRITICAL,
        category: CommentCategory.LEAD_ENQUIRY,
        sentiment: Sentiment.POSITIVE,
        requiresHumanReply: true,
        aiReasoning: 'High-value agency partner prospect inquiring about white-label reselling rights for 8 accounts.',
        topicTags: ['white-label', 'agency-partner', 'reseller', 'licensing'],
        aiDraftReply:
          'Hello Victoria! Our Agency Partner programme includes full custom-domain white-labelling and consolidated tenant management. I would love to connect you with our Partnerships Director—what is the best email to reach you?',
      },
    },
    // 9. Spam / Bot comment -> P4_LOW, SPAM_TROLL (Ignored / Hidden)
    {
      postId: post2.id,
      externalCommentId: 'comm_ig_009',
      authorName: 'CryptoSignals_Daily_99',
      authorUsername: 'cryptosignals_daily_99',
      authorExternalId: 'ext_bot_901',
      body: 'DM @forex_guru_mark to earn 500% profit in 24 hours guaranteed! Click the link in bio 🔥💰🚀',
      publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      isHidden: true,
      triage: {
        status: TriageStatus.IGNORED,
        priority: PriorityLevel.P4_LOW,
        category: CommentCategory.SPAM_TROLL,
        sentiment: Sentiment.NEUTRAL,
        requiresHumanReply: false,
        aiReasoning: 'Automated cryptocurrency phishing spam bot soliciting financial services.',
        topicTags: ['spam', 'crypto-scam', 'bot'],
        aiDraftReply: null,
      },
    },
    // 10. Low Priority emoji-only comment -> P4_LOW, GENERAL_CHAT
    {
      postId: post1.id,
      externalCommentId: 'comm_ig_010',
      authorName: 'Chloe Taylor',
      authorUsername: 'chloe_t',
      authorExternalId: 'ext_user_410',
      body: '🙌🔥👏',
      publishedAt: new Date(Date.now() - 14 * 60 * 60 * 1000),
      triage: {
        status: TriageStatus.ANSWERED,
        priority: PriorityLevel.P4_LOW,
        category: CommentCategory.GENERAL_CHAT,
        sentiment: Sentiment.POSITIVE,
        requiresHumanReply: false,
        aiReasoning: 'Emoji-only applause reaction requiring no substantive reply.',
        topicTags: ['emoji-reaction'],
        aiDraftReply: null,
        respondedAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
        respondedBy: 'Auto-Archived',
      },
    },
    // 11. Security Question on FB Post -> P2_HIGH, PRODUCT_QUESTION
    {
      postId: post3.id,
      externalCommentId: 'comm_fb_011',
      authorName: 'Alexander Wright',
      authorUsername: 'awright_sec',
      authorExternalId: 'ext_user_411',
      body: 'How do you handle Meta token invalidation when business managers rotate passwords? Do webhook deliveries pause or fail silently?',
      publishedAt: new Date(Date.now() - 18 * 60 * 60 * 1000),
      triage: {
        status: TriageStatus.DRAFT_READY,
        priority: PriorityLevel.P2_HIGH,
        category: CommentCategory.PRODUCT_QUESTION,
        sentiment: Sentiment.NEUTRAL,
        requiresHumanReply: true,
        aiReasoning: 'Technical inquiry regarding token lifecycle management, resilience against expiry, and reconciliation crons.',
        topicTags: ['system-user-token', 'meta-api', 'security', 'reconciliation-cron'],
        aiDraftReply:
          'Great question Alexander! We utilize non-expiring System User Access Tokens rather than standard user OAuth tokens, coupled with a 15-minute reconciliation cron that alerts on any delivery anomalies before token degradation impacts ingestion.',
      },
    },
    // 12. Negative Feedback / Complaint -> P2_HIGH, COMPLAINT_SUPPORT
    {
      postId: post4.id,
      externalCommentId: 'comm_fb_012',
      authorName: 'Rachel Green',
      authorUsername: 'rachel_digital',
      authorExternalId: 'ext_user_412',
      body: 'Tried reaching out via the website contact form 3 days ago about API access and received no confirmation email. Is support active?',
      publishedAt: new Date(Date.now() - 22 * 60 * 60 * 1000),
      triage: {
        status: TriageStatus.NEEDS_REPLY,
        priority: PriorityLevel.P2_HIGH,
        category: CommentCategory.COMPLAINT_SUPPORT,
        sentiment: Sentiment.NEGATIVE,
        requiresHumanReply: true,
        aiReasoning: 'Prospective client expressing frustration over unanswered web inquiry.',
        topicTags: ['lead-routing', 'contact-form-delay', 'support-sla'],
        aiDraftReply:
          'Rachel, we are very sorry for the delay! We have had unprecedented demand following our v1 announcement. I have flagged your email to our Head of Inbound directly—could you confirm if you sent it from rachel@ or drop us a quick DM?',
      },
    },
  ];

  // external id → internal id, so seeded clusters can reference real Comment rows
  const internalIdByExternal = new Map<string, string>();

  for (const c of commentsData) {
    const { triage, ...commentFields } = c;
    const comment = await prisma.comment.create({
      data: commentFields,
    });
    internalIdByExternal.set(comment.externalCommentId, comment.id);

    await prisma.commentTriage.create({
      data: {
        commentId: comment.id,
        ...triage,
        // Seeded rows represent untouched AI output, so the AI originals equal the current values.
        aiPriority: triage.priority,
        aiCategory: triage.category,
      },
    });
  }

  const ids = (...external: string[]) =>
    external.map((e) => internalIdByExternal.get(e)).filter((v): v is string => Boolean(v));
  console.log('✓ 12 realistic comments and triage records seeded');

  // Add a sample nested reply from the brand to simulate active thread
  const parentComment = await prisma.comment.findUnique({
    where: { externalCommentId: 'comm_ig_006' },
  });
  if (parentComment) {
    await prisma.comment.create({
      data: {
        postId: parentComment.postId,
        parentCommentId: parentComment.id,
        externalCommentId: 'comm_ig_006_reply_brand',
        authorName: 'Aether AI Official',
        authorUsername: 'aetherai.io',
        authorExternalId: 'ig_biz_9928374102',
        body: 'Hi Elena! Yes, we offer native webhooks and a pre-built Zapier app to push LEAD_ENQUIRY comments straight to HubSpot.',
        isFromBrand: true,
        publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      },
    });
    console.log('✓ Nested brand reply seeded to demonstrate thread structure');
  }

  // 6. Content Clusters (3 sample intelligence briefs)
  await prisma.contentCluster.create({
    data: {
      themeTitle: 'Agency & Multi-Seat Pricing Transparency',
      summaryInsight:
        'Mid-size marketing agencies and brand managers are repeatedly asking for transparent tier structures for multi-brand management. They are currently overwhelmed by per-seat SaaS costs on incumbent tools.',
      suggestedContentAngle:
        'Publish a comprehensive breakdown comparing per-seat vs unified workspace pricing models. Highlight how our agency license eliminates penalty fees for scaling community headcount.',
      recommendedFormats: ['IG Carousel (5 slides)', 'LinkedIn Deep Dive', 'Pricing Calculator Web Tool'],
      commentCount: 2,
      sampleCommentIds: ids('comm_ig_001', 'comm_fb_008'),
      dateRangeStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      dateRangeEnd: new Date(),
    },
  });

  await prisma.contentCluster.create({
    data: {
      themeTitle: 'Data Sovereignty & On-Premise LLM Compliance',
      summaryInsight:
        'Regulated UK & European enterprises (fintech, healthcare, legal) want to know whether customer engagement data is stored or processed on third-party cloud LLMs or if private VPC inference is supported.',
      suggestedContentAngle:
        'An architectural teardown showing how local Llama-3 / Ollama models route sensitive community data while strictly adhering to GDPR and UK Data Protection laws without leaking PII.',
      recommendedFormats: ['Technical Blog Post', 'Reels 60s Explainer', 'Security Architecture Whitepaper'],
      commentCount: 1,
      sampleCommentIds: ids('comm_fb_003'),
      dateRangeStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      dateRangeEnd: new Date(),
    },
  });

  await prisma.contentCluster.create({
    data: {
      themeTitle: 'Native App Reply Synchronization Mechanics',
      summaryInsight:
        'Community managers are hesitant to adopt desktop dashboards because they fear missing replies sent on mobile while commuting. Educating them on our bi-directional webhook sync will unlock rapid adoption.',
      suggestedContentAngle:
        'Short behind-the-scenes video showing a team member replying natively in the Instagram app and watching the desktop dashboard automatically flip from "Needs Reply" to "Answered" in real time.',
      recommendedFormats: ['TikTok / Reels Workflow Demo', 'Interactive GIF Showcase', 'Twitter/X Thread'],
      commentCount: 1,
      sampleCommentIds: ids('comm_ig_006'),
      dateRangeStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      dateRangeEnd: new Date(),
    },
  });
  console.log('✓ 3 sample content clusters seeded');

  console.log('✅ Database seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
