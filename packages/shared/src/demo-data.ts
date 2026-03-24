import type { DemoState } from "./types";

export const seedDemoState: DemoState = {
  weekOf: "2026-03-23",
  workspaceTitle: "Week of March 23, 2026",
  setup: {
    auth0AccountEmail: "building.something.awesome@gmail.com",
    contacts: [
      {
        id: "contact-principal",
        name: "Dr. Elena Morris",
        role: "Principal",
        email: "principal@lincoln-elementary.edu",
      },
      {
        id: "contact-teacher-rep",
        name: "Nina Patel",
        role: "Teacher Rep",
        email: "teacher.rep@lincoln-elementary.edu",
      },
      {
        id: "contact-board-president",
        name: "Jordan Lee",
        role: "PTA President",
        email: "president@lincolnpta.org",
      },
      {
        id: "contact-board-secretary",
        name: "Maya Chen",
        role: "PTA Secretary",
        email: "secretary@lincolnpta.org",
      },
    ],
    schoolBreaks: [
      {
        id: "break-spring-2026",
        name: "Spring Break",
        startsOn: "2026-04-06",
        endsOn: "2026-04-10",
      },
      {
        id: "break-summer-2026",
        name: "Summer Break",
        startsOn: "2026-06-08",
        endsOn: "2026-08-14",
      },
    ],
    integrations: {
      auth0: {
        mode: "live",
        status: "pending",
        description: "Auth0 tenant and application need to be wired with Next.js SDK.",
      },
      gmail: {
        mode: "live",
        status: "needs_setup",
        description:
          "Connect Gmail through Auth0 Token Vault. Mock reminder thread remains available for demo fallback.",
      },
      membershipToolkit: {
        mode: "mock",
        status: "mock_ready",
        description: "Local JSON-backed Membership Toolkit adapter for duplicate/update/publish/schedule.",
      },
      mockMessages: {
        mode: "mock",
        status: "mock_ready",
        description: "Local WhatsApp and iMessage simulator for demo content collection.",
      },
      flyer: {
        mode: "mock",
        status: "mock_ready",
        description: "School-friendly mock flyer generator with image placeholders.",
      },
    },
  },
  planner: {
    currentStage: "collect_updates",
    timeline: [
      {
        stage: "monday_reminder",
        label: "Monday reminder",
        targetTime: "2026-03-23T08:00:00-07:00",
        status: "done",
      },
      {
        stage: "collect_updates",
        label: "Collect updates",
        targetTime: "2026-03-24T14:00:00-07:00",
        status: "active",
      },
      {
        stage: "wednesday_draft",
        label: "Board draft",
        targetTime: "2026-03-25T08:30:00-07:00",
        status: "upcoming",
      },
      {
        stage: "thursday_teacher_release",
        label: "Teacher release",
        targetTime: "2026-03-26T15:30:00-07:00",
        status: "upcoming",
      },
      {
        stage: "sunday_parent_schedule",
        label: "Parent newsletter",
        targetTime: "2026-03-29T18:00:00-07:00",
        status: "upcoming",
      },
    ],
    skipNextParentSend: false,
  },
  inbox: {
    gmailThreads: [
      {
        id: "gmail-thread-reminder-1",
        subject: "PTA this week: quick reminder + last newsletter",
        lastUpdatedAt: "2026-03-24T08:14:00-07:00",
        messages: [
          {
            id: "gmail-msg-1",
            sender: "PTA Pilot Demo",
            senderEmail: "vp.comms@lincolnpta.org",
            sentAt: "2026-03-23T08:03:00-07:00",
            body:
              "Good morning PTA families. Here is last week's newsletter, plus a quick snapshot of Book Fair, STEM Night, and Friday coffee with the principal.",
          },
          {
            id: "gmail-msg-2",
            sender: "Avery Gomez",
            senderEmail: "avery.gomez@gmail.com",
            sentAt: "2026-03-24T07:45:00-07:00",
            body:
              "Please add that we still need 4 volunteers for STEM Night setup and 2 cleanup helpers.",
          },
          {
            id: "gmail-msg-3",
            sender: "Nina Patel",
            senderEmail: "teacher.rep@lincoln-elementary.edu",
            sentAt: "2026-03-24T08:14:00-07:00",
            body:
              "Teachers asked if the teacher edition can highlight the new library schedule and staff appreciation lunch timing.",
          },
        ],
      },
    ],
    mockMessages: [
      {
        id: "mock-msg-1",
        source: "whatsapp",
        sender: "Marcus (Room Parent)",
        sentAt: "2026-03-24T09:10:00-07:00",
        body:
          "Can we feature Book Fair family shopping night? Thursday 5:30-7:00 PM in the library.",
      },
      {
        id: "mock-msg-2",
        source: "imessage",
        sender: "Dr. Elena Morris",
        sentAt: "2026-03-24T09:42:00-07:00",
        body:
          "Principal note: please lead with attendance week reminder and mention Friday coffee chat starts at 8:15 AM.",
      },
      {
        id: "mock-msg-3",
        source: "whatsapp",
        sender: "Fundraising Chair",
        sentAt: "2026-03-24T10:03:00-07:00",
        body:
          "STEM Night is visual enough that a flyer would probably work better than a text blurb.",
        imageUrl:
          "https://images.unsplash.com/photo-1516117172878-fd2c41f4a759?auto=format&fit=crop&w=1200&q=80",
      },
    ],
    extractedItems: [
      {
        id: "extract-1",
        title: "Attendance Spirit Week reminder",
        summary: "Schoolwide attendance push should open the newsletter because it affects every family this week.",
        source: "imessage",
        sourceRef: "mock-msg-2",
        priority: "urgent",
        recommendedPlacement: "Top story",
        recommendedAsFlyer: false,
      },
      {
        id: "extract-2",
        title: "STEM Night volunteer ask",
        summary: "Need 4 setup volunteers and 2 cleanup helpers for Thursday STEM Night.",
        source: "gmail",
        sourceRef: "gmail-msg-2",
        priority: "time_sensitive",
        recommendedPlacement: "Events section",
        recommendedAsFlyer: true,
      },
      {
        id: "extract-3",
        title: "Book Fair family shopping night",
        summary: "Thursday 5:30-7:00 PM in the library for families.",
        source: "whatsapp",
        sourceRef: "mock-msg-1",
        priority: "time_sensitive",
        recommendedPlacement: "Events section",
        recommendedAsFlyer: false,
      },
    ],
  },
  newsletters: {
    lastPublishedParent: {
      id: "newsletter-parent-last",
      audience: "parents",
      title: "Lincoln PTA Parent Newsletter",
      summary: "Last week's published parent edition.",
      status: "published",
      publishedAt: "2026-03-16T18:00:00-07:00",
      sections: [
        {
          id: "section-last-1",
          title: "From the PTA",
          kind: "community",
          items: [
            {
              id: "item-last-1",
              title: "Thank you for Jog-a-Thon support",
              body: "Families raised over $18,000 and helped fund spring enrichment.",
              priority: "evergreen",
              sourceBadges: ["Membership Toolkit"],
            },
          ],
        },
      ],
    },
    board: {
      id: "newsletter-board-draft",
      audience: "board",
      title: "Lincoln PTA Board Review Draft",
      summary: "Board version includes placement notes and edit requests.",
      status: "draft",
      sourceNewsletterId: "newsletter-parent-last",
      sections: [
        {
          id: "section-board-1",
          title: "Urgent schoolwide items",
          kind: "urgent_schoolwide",
          items: [
            {
              id: "board-item-1",
              title: "Attendance Spirit Week reminder",
              body: "Lead with attendance encouragement and Friday coffee chat timing from the principal.",
              priority: "urgent",
              sourceBadges: ["iMessage", "Principal"],
            },
          ],
        },
        {
          id: "section-board-2",
          title: "Events",
          kind: "events",
          items: [
            {
              id: "board-item-2",
              title: "STEM Night volunteer ask",
              body: "Need 4 setup volunteers and 2 cleanup helpers. Candidate for flyer treatment.",
              priority: "time_sensitive",
              sourceBadges: ["Gmail reply", "WhatsApp"],
              flyerRecommended: true,
            },
            {
              id: "board-item-3",
              title: "Book Fair family shopping night",
              body: "Thursday 5:30-7:00 PM in the library.",
              priority: "time_sensitive",
              sourceBadges: ["WhatsApp"],
            },
          ],
        },
      ],
    },
    teachers: {
      id: "newsletter-teachers-draft",
      audience: "teachers",
      title: "Lincoln PTA Teacher Edition",
      summary: "Teacher version ready for Thursday release.",
      status: "draft",
      sourceNewsletterId: "newsletter-board-draft",
      sections: [
        {
          id: "section-teachers-1",
          title: "Teacher notes",
          kind: "teacher_note",
          items: [
            {
              id: "teacher-item-1",
              title: "Staff appreciation lunch timing",
              body: "Include lunch timing and updated library schedule.",
              priority: "time_sensitive",
              sourceBadges: ["Teacher Rep"],
            },
          ],
        },
      ],
    },
    parents: {
      id: "newsletter-parent-draft",
      audience: "parents",
      title: "Lincoln PTA Parent Newsletter",
      summary: "Parent version queued for Sunday scheduling.",
      status: "draft",
      sourceNewsletterId: "newsletter-board-draft",
      sections: [
        {
          id: "section-parent-1",
          title: "Events",
          kind: "events",
          items: [
            {
              id: "parent-item-1",
              title: "Book Fair family shopping night",
              body: "Thursday 5:30-7:00 PM in the library.",
              priority: "time_sensitive",
              sourceBadges: ["WhatsApp"],
            },
          ],
        },
      ],
    },
  },
  flyerRecommendations: [
    {
      id: "flyer-1",
      title: "STEM Night volunteer flyer",
      brief:
        "Friendly school flyer featuring microscopes, robots, and a bold volunteer callout for setup and cleanup.",
      reason: "The volunteer ask is visual, time-sensitive, and likely to outperform a plain text blurb.",
      status: "recommended",
      imageUrl:
        "https://images.unsplash.com/photo-1581091215367-59ab6dcef10c?auto=format&fit=crop&w=1200&q=80",
    },
  ],
  approvals: [
    {
      id: "approval-monday",
      type: "send_reminder_email",
      title: "Monday reminder email",
      audience: "members",
      channel: "gmail",
      status: "approved",
      subject: "PTA this week: quick reminder + last newsletter",
      body:
        "Good morning PTA families. Sharing last week's newsletter plus a quick look at Book Fair, STEM Night, and Friday coffee with the principal.",
      rationale: "Low-risk recap email sent Monday morning through Gmail.",
      requiresHumanApproval: true,
      createdAt: "2026-03-23T07:45:00-07:00",
      updatedAt: "2026-03-23T08:02:00-07:00",
    },
    {
      id: "approval-wednesday",
      type: "send_board_draft_email",
      title: "Wednesday board review email",
      audience: "board",
      channel: "gmail",
      status: "pending",
      subject: "Board review: PTA newsletter draft for this week",
      body:
        "Hi board team, attached is this week's draft newsletter with urgent schoolwide items first and time-sensitive events above evergreen content. Please send edits by Wednesday 5 PM.",
      rationale: "Board draft is ready after inbox ingestion and should go out Wednesday morning.",
      requiresHumanApproval: true,
      createdAt: "2026-03-24T10:30:00-07:00",
      updatedAt: "2026-03-24T10:30:00-07:00",
    },
    {
      id: "approval-thursday",
      type: "publish_teacher_version",
      title: "Thursday teacher release",
      audience: "teachers",
      channel: "membership_toolkit",
      status: "pending",
      subject: "Teacher edition ready for release",
      body:
        "Publish the teacher version, then email the Principal and Teacher Rep with the direct link and summary of changes.",
      rationale: "Teacher-targeted content is separated before parent delivery.",
      requiresHumanApproval: true,
      createdAt: "2026-03-24T10:31:00-07:00",
      updatedAt: "2026-03-24T10:31:00-07:00",
    },
    {
      id: "approval-sunday",
      type: "schedule_parent_version",
      title: "Sunday parent newsletter schedule",
      audience: "parents",
      channel: "membership_toolkit",
      status: "pending",
      subject: "Schedule parent newsletter for Sunday at 6:00 PM",
      body:
        "Schedule the parent version for Sunday at 6:00 PM unless the planner detects an upcoming school break.",
      scheduledFor: "2026-03-29T18:00:00-07:00",
      rationale: "Sunday release aligns with the weekly PTA cadence and checks break logic before execution.",
      requiresHumanApproval: true,
      createdAt: "2026-03-24T10:32:00-07:00",
      updatedAt: "2026-03-24T10:32:00-07:00",
    },
  ],
  auditLog: [
    {
      id: "audit-1",
      timestamp: "2026-03-23T08:02:00-07:00",
      integration: "gmail",
      kind: "execution",
      summary: "Monday reminder email approved and sent through the Gmail workflow.",
    },
    {
      id: "audit-2",
      timestamp: "2026-03-24T10:20:00-07:00",
      integration: "mock_messages",
      kind: "ingestion",
      summary: "Collected 3 mock messages and 2 Gmail replies for this week's newsletter cycle.",
    },
    {
      id: "audit-3",
      timestamp: "2026-03-24T10:28:00-07:00",
      integration: "ai",
      kind: "suggestion",
      summary: "Recommended a flyer treatment for the STEM Night volunteer request.",
    },
  ],
};
