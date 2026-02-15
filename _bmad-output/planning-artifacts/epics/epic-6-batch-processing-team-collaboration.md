# Epic 6: Batch Processing & Team Collaboration

**Goal:** Teams can process multiple files efficiently, assign work to specific reviewers by language pair, set file priorities, and receive notifications — enabling coordinated team QA workflows.

**FRs covered:** FR56, FR57, FR58, FR60
**NFRs addressed:** NFR17 (no progress lost), NFR20 (6-9 concurrent users MVP)
**Architecture:** Supabase Realtime for notifications, file assignment with RLS scoping, priority queue via Inngest

### Story 6.1: File Assignment & Language-Pair Matching

As an Admin or PM,
I want to assign files to specific reviewers filtered by language pair and urgency,
So that work is distributed efficiently to reviewers with the right language expertise.

**Acceptance Criteria:**

**Given** an Admin or PM views a batch of uploaded files
**When** they open the file assignment interface
**Then** they see a ReviewerSelector component showing: available reviewers filtered by language pair compatibility, each reviewer's current workload = `COUNT(file_assignments WHERE assigned_to = reviewer AND status IN ('assigned', 'in_progress'))`, and an urgency flag toggle (FR56)
**And** language-pair filtering shows only reviewers whose profile includes the file's target language

**Given** the Admin assigns a file to a reviewer
**When** the assignment is saved
**Then** the file's `assigned_to` field is updated
**And** the assigned reviewer receives a notification: "File '{filename}' assigned to you" (FR60)
**And** the assignment is logged in the audit trail

**Given** a file has an urgency flag set
**When** the file appears in the reviewer's queue
**Then** it is displayed at the top with a red "Urgent" badge
**And** urgent files are processed first in the Inngest queue (priority ordering) (FR58)

**Given** a file is already assigned to a reviewer
**When** another reviewer attempts to open it for review
**Then** a soft lock warning displays: "This file is being reviewed by {name} — last active {time}" (FR57)
**And** the second reviewer can choose: "View read-only" or "Take over" (with notification to original assignee)

**Given** file assignment data
**When** I inspect the database
**Then** the `file_assignments` table contains: id, file_id, project_id, tenant_id, assigned_to, assigned_by, priority (normal/urgent), status (assigned/in_progress/completed), assigned_at, started_at, completed_at

### Story 6.2: Event Notifications & Real-time Updates

As a QA Reviewer,
I want to receive notifications for relevant events like analysis completion, file assignments, and glossary updates,
So that I stay informed and can respond quickly to changes.

**Acceptance Criteria:**

**Given** the notification system is active
**When** any of the following events occur:
- Analysis complete (event fires WHEN `score_status = 'calculated'` AND all findings inserted AND `layer_completed` value set)
- File assigned to reviewer
- Glossary updated for project
- Auto-pass triggered for a file
**Then** relevant users receive notifications via Supabase Realtime push (FR60)
**And** notifications appear as: (1) toast (sonner) for immediate attention, (2) persisted in notification dropdown (bell icon in header)

**Given** a notification is received
**When** the user views the notification dropdown
**Then** notifications are listed chronologically (newest first) with: event type icon, message text, timestamp, and read/unread indicator
**And** clicking a notification navigates to the relevant context (e.g., file review view)
**And** unread count badge shows on the bell icon

**Given** multiple events fire in quick succession (e.g., batch processing completes)
**When** notifications are generated
**Then** similar events are grouped if: same event_type AND created_at within 5 minutes AND same project_id — e.g., "Analysis complete for 5 files" instead of 5 individual notifications
**And** grouped notifications expand to show individual items on click

**Given** the notification system
**When** I inspect the database
**Then** the `notifications` table contains: id, user_id, tenant_id, event_type, title, message, metadata (jsonb — link target), is_read, created_at
**And** notifications older than 30 days are auto-archived

---
