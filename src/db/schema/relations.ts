import { relations } from 'drizzle-orm'

import { aiMetricsTimeseries } from './aiMetricsTimeseries'
import { aiUsageLogs } from './aiUsageLogs'
import { auditLogs } from './auditLogs'
import { auditResults } from './auditResults'
import { exportedReports } from './exportedReports'
import { feedbackEvents } from './feedbackEvents'
import { fileAssignments } from './fileAssignments'
import { files } from './files'
import { findings } from './findings'
import { fixSuggestions } from './fixSuggestions'
import { glossaries } from './glossaries'
import { glossaryTerms } from './glossaryTerms'
import { languagePairConfigs } from './languagePairConfigs'
import { notifications } from './notifications'
import { projects } from './projects'
import { reviewActions } from './reviewActions'
import { reviewSessions } from './reviewSessions'
import { runMetadata } from './runMetadata'
import { scores } from './scores'
import { segments } from './segments'
import { selfHealingConfig } from './selfHealingConfig'
import { severityConfigs } from './severityConfigs'
import { suppressionRules } from './suppressionRules'
import { tenants } from './tenants'
import { uploadBatches } from './uploadBatches'
import { userRoles } from './userRoles'
import { users } from './users'

// --- Tenants ---
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  userRoles: many(userRoles),
  projects: many(projects),
  glossaries: many(glossaries),
  languagePairConfigs: many(languagePairConfigs),
  severityConfigs: many(severityConfigs),
  auditLogs: many(auditLogs),
  notifications: many(notifications),
  selfHealingConfig: many(selfHealingConfig),
}))

// --- Users ---
export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  userRoles: many(userRoles),
  reviewSessions: many(reviewSessions),
  feedbackEvents: many(feedbackEvents),
  notifications: many(notifications),
}))

// --- User Roles ---
export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  tenant: one(tenants, { fields: [userRoles.tenantId], references: [tenants.id] }),
}))

// --- Projects ---
export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(tenants, { fields: [projects.tenantId], references: [tenants.id] }),
  files: many(files),
  scores: many(scores),
  reviewSessions: many(reviewSessions),
  glossaries: many(glossaries),
  suppressionRules: many(suppressionRules),
  exportedReports: many(exportedReports),
  auditResults: many(auditResults),
  aiMetricsTimeseries: many(aiMetricsTimeseries),
}))

// --- Files ---
export const filesRelations = relations(files, ({ one, many }) => ({
  project: one(projects, { fields: [files.projectId], references: [projects.id] }),
  tenant: one(tenants, { fields: [files.tenantId], references: [tenants.id] }),
  uploadedByUser: one(users, { fields: [files.uploadedBy], references: [users.id] }),
  batch: one(uploadBatches, { fields: [files.batchId], references: [uploadBatches.id] }),
  segments: many(segments),
  scores: many(scores),
  fileAssignments: many(fileAssignments),
  aiUsageLogs: many(aiUsageLogs),
  runMetadata: many(runMetadata),
}))

// --- Segments ---
export const segmentsRelations = relations(segments, ({ one, many }) => ({
  file: one(files, { fields: [segments.fileId], references: [files.id] }),
  project: one(projects, { fields: [segments.projectId], references: [projects.id] }),
  tenant: one(tenants, { fields: [segments.tenantId], references: [tenants.id] }),
  findings: many(findings),
}))

// --- Findings ---
export const findingsRelations = relations(findings, ({ one, many }) => ({
  segment: one(segments, { fields: [findings.segmentId], references: [segments.id] }),
  project: one(projects, { fields: [findings.projectId], references: [projects.id] }),
  tenant: one(tenants, { fields: [findings.tenantId], references: [tenants.id] }),
  reviewSession: one(reviewSessions, {
    fields: [findings.reviewSessionId],
    references: [reviewSessions.id],
  }),
  reviewActions: many(reviewActions),
  feedbackEvents: many(feedbackEvents),
  fixSuggestions: many(fixSuggestions),
}))

// --- Scores ---
export const scoresRelations = relations(scores, ({ one }) => ({
  file: one(files, { fields: [scores.fileId], references: [files.id] }),
  project: one(projects, { fields: [scores.projectId], references: [projects.id] }),
  tenant: one(tenants, { fields: [scores.tenantId], references: [tenants.id] }),
}))

// --- Review Sessions ---
export const reviewSessionsRelations = relations(reviewSessions, ({ one, many }) => ({
  project: one(projects, {
    fields: [reviewSessions.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [reviewSessions.tenantId],
    references: [tenants.id],
  }),
  reviewer: one(users, {
    fields: [reviewSessions.reviewerId],
    references: [users.id],
  }),
  findings: many(findings),
}))

// --- Review Actions ---
export const reviewActionsRelations = relations(reviewActions, ({ one }) => ({
  finding: one(findings, {
    fields: [reviewActions.findingId],
    references: [findings.id],
  }),
  file: one(files, { fields: [reviewActions.fileId], references: [files.id] }),
  project: one(projects, {
    fields: [reviewActions.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [reviewActions.tenantId],
    references: [tenants.id],
  }),
  user: one(users, { fields: [reviewActions.userId], references: [users.id] }),
}))

// --- Glossaries ---
export const glossariesRelations = relations(glossaries, ({ one, many }) => ({
  tenant: one(tenants, { fields: [glossaries.tenantId], references: [tenants.id] }),
  project: one(projects, { fields: [glossaries.projectId], references: [projects.id] }),
  terms: many(glossaryTerms),
}))

// --- Glossary Terms ---
export const glossaryTermsRelations = relations(glossaryTerms, ({ one }) => ({
  glossary: one(glossaries, {
    fields: [glossaryTerms.glossaryId],
    references: [glossaries.id],
  }),
}))

// --- Language Pair Configs ---
export const languagePairConfigsRelations = relations(languagePairConfigs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [languagePairConfigs.tenantId],
    references: [tenants.id],
  }),
}))

// --- Severity Configs ---
export const severityConfigsRelations = relations(severityConfigs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [severityConfigs.tenantId],
    references: [tenants.id],
  }),
}))

// --- Audit Logs ---
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}))

// --- AI Usage Logs ---
export const aiUsageLogsRelations = relations(aiUsageLogs, ({ one }) => ({
  file: one(files, { fields: [aiUsageLogs.fileId], references: [files.id] }),
  project: one(projects, {
    fields: [aiUsageLogs.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [aiUsageLogs.tenantId],
    references: [tenants.id],
  }),
}))

// --- Feedback Events ---
export const feedbackEventsRelations = relations(feedbackEvents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [feedbackEvents.tenantId],
    references: [tenants.id],
  }),
  finding: one(findings, {
    fields: [feedbackEvents.findingId],
    references: [findings.id],
  }),
  file: one(files, { fields: [feedbackEvents.fileId], references: [files.id] }),
  project: one(projects, {
    fields: [feedbackEvents.projectId],
    references: [projects.id],
  }),
  reviewer: one(users, {
    fields: [feedbackEvents.reviewerId],
    references: [users.id],
  }),
}))

// --- Run Metadata ---
export const runMetadataRelations = relations(runMetadata, ({ one }) => ({
  file: one(files, { fields: [runMetadata.fileId], references: [files.id] }),
  project: one(projects, {
    fields: [runMetadata.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [runMetadata.tenantId],
    references: [tenants.id],
  }),
}))

// --- Suppression Rules ---
export const suppressionRulesRelations = relations(suppressionRules, ({ one }) => ({
  project: one(projects, {
    fields: [suppressionRules.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [suppressionRules.tenantId],
    references: [tenants.id],
  }),
  createdByUser: one(users, {
    fields: [suppressionRules.createdBy],
    references: [users.id],
  }),
}))

// --- File Assignments ---
export const fileAssignmentsRelations = relations(fileAssignments, ({ one }) => ({
  file: one(files, { fields: [fileAssignments.fileId], references: [files.id] }),
  project: one(projects, {
    fields: [fileAssignments.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [fileAssignments.tenantId],
    references: [tenants.id],
  }),
  assignedToUser: one(users, {
    fields: [fileAssignments.assignedTo],
    references: [users.id],
    relationName: 'assignedTo',
  }),
  assignedByUser: one(users, {
    fields: [fileAssignments.assignedBy],
    references: [users.id],
    relationName: 'assignedBy',
  }),
}))

// --- Notifications ---
export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notifications.tenantId],
    references: [tenants.id],
  }),
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}))

// --- Exported Reports ---
export const exportedReportsRelations = relations(exportedReports, ({ one }) => ({
  project: one(projects, {
    fields: [exportedReports.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [exportedReports.tenantId],
    references: [tenants.id],
  }),
  generatedByUser: one(users, {
    fields: [exportedReports.generatedBy],
    references: [users.id],
  }),
}))

// --- Audit Results ---
export const auditResultsRelations = relations(auditResults, ({ one }) => ({
  project: one(projects, {
    fields: [auditResults.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [auditResults.tenantId],
    references: [tenants.id],
  }),
}))

// --- AI Metrics Timeseries ---
export const aiMetricsTimeseriesRelations = relations(aiMetricsTimeseries, ({ one }) => ({
  project: one(projects, {
    fields: [aiMetricsTimeseries.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [aiMetricsTimeseries.tenantId],
    references: [tenants.id],
  }),
}))

// --- Fix Suggestions ---
export const fixSuggestionsRelations = relations(fixSuggestions, ({ one }) => ({
  finding: one(findings, {
    fields: [fixSuggestions.findingId],
    references: [findings.id],
  }),
  tenant: one(tenants, {
    fields: [fixSuggestions.tenantId],
    references: [tenants.id],
  }),
}))

// --- Self Healing Config ---
export const selfHealingConfigRelations = relations(selfHealingConfig, ({ one }) => ({
  tenant: one(tenants, {
    fields: [selfHealingConfig.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [selfHealingConfig.projectId],
    references: [projects.id],
  }),
}))

// --- Upload Batches ---
export const uploadBatchesRelations = relations(uploadBatches, ({ one, many }) => ({
  project: one(projects, { fields: [uploadBatches.projectId], references: [projects.id] }),
  tenant: one(tenants, { fields: [uploadBatches.tenantId], references: [tenants.id] }),
  createdByUser: one(users, { fields: [uploadBatches.createdBy], references: [users.id] }),
  files: many(files),
}))
