import { relations } from 'drizzle-orm/relations'

import {
  segments,
  backTranslationCache,
  tenants,
  findings,
  findingAssignments,
  files,
  projects,
  users,
  findingComments,
  parityReports,
  missingCheckReports,
  scores,
  reviewSessions,
  reviewActions,
  glossaries,
  languagePairConfigs,
  severityConfigs,
  feedbackEvents,
  runMetadata,
  suppressionRules,
  fileAssignments,
  aiUsageLogs,
  userRoles,
  glossaryTerms,
  notifications,
  exportedReports,
  auditResults,
  aiMetricsTimeseries,
  fixSuggestions,
  selfHealingConfig,
  uploadBatches,
  auditLogs202603,
  auditLogs202602,
  auditLogs202604,
  auditLogs202605,
  auditLogs202606,
} from './schema'

export const backTranslationCacheRelations = relations(backTranslationCache, ({ one }) => ({
  segment: one(segments, {
    fields: [backTranslationCache.segmentId],
    references: [segments.id],
  }),
  tenant: one(tenants, {
    fields: [backTranslationCache.tenantId],
    references: [tenants.id],
  }),
}))

export const segmentsRelations = relations(segments, ({ one, many }) => ({
  backTranslationCaches: many(backTranslationCache),
  file: one(files, {
    fields: [segments.fileId],
    references: [files.id],
  }),
  project: one(projects, {
    fields: [segments.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [segments.tenantId],
    references: [tenants.id],
  }),
  findings: many(findings),
}))

export const tenantsRelations = relations(tenants, ({ many }) => ({
  backTranslationCaches: many(backTranslationCache),
  findingAssignments: many(findingAssignments),
  findingComments: many(findingComments),
  parityReports: many(parityReports),
  missingCheckReports: many(missingCheckReports),
  projects: many(projects),
  users: many(users),
  scores: many(scores),
  reviewSessions: many(reviewSessions),
  reviewActions: many(reviewActions),
  glossaries: many(glossaries),
  languagePairConfigs: many(languagePairConfigs),
  severityConfigs: many(severityConfigs),
  feedbackEvents: many(feedbackEvents),
  runMetadata: many(runMetadata),
  suppressionRules: many(suppressionRules),
  fileAssignments: many(fileAssignments),
  aiUsageLogs: many(aiUsageLogs),
  userRoles: many(userRoles),
  glossaryTerms: many(glossaryTerms),
  segments: many(segments),
  notifications: many(notifications),
  exportedReports: many(exportedReports),
  auditResults: many(auditResults),
  aiMetricsTimeseries: many(aiMetricsTimeseries),
  fixSuggestions: many(fixSuggestions),
  selfHealingConfigs: many(selfHealingConfig),
  uploadBatches: many(uploadBatches),
  files: many(files),
  findings: many(findings),
  auditLogs202603s: many(auditLogs202603),
  auditLogs202602s: many(auditLogs202602),
  auditLogs202604s: many(auditLogs202604),
  auditLogs202605s: many(auditLogs202605),
  auditLogs202606s: many(auditLogs202606),
}))

export const findingAssignmentsRelations = relations(findingAssignments, ({ one, many }) => ({
  finding: one(findings, {
    fields: [findingAssignments.findingId],
    references: [findings.id],
  }),
  file: one(files, {
    fields: [findingAssignments.fileId],
    references: [files.id],
  }),
  project: one(projects, {
    fields: [findingAssignments.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [findingAssignments.tenantId],
    references: [tenants.id],
  }),
  user_assignedTo: one(users, {
    fields: [findingAssignments.assignedTo],
    references: [users.id],
    relationName: 'findingAssignments_assignedTo_users_id',
  }),
  user_assignedBy: one(users, {
    fields: [findingAssignments.assignedBy],
    references: [users.id],
    relationName: 'findingAssignments_assignedBy_users_id',
  }),
  findingComments: many(findingComments),
}))

export const findingsRelations = relations(findings, ({ one, many }) => ({
  findingAssignments: many(findingAssignments),
  findingComments: many(findingComments),
  reviewActions: many(reviewActions),
  feedbackEvents: many(feedbackEvents),
  fixSuggestions: many(fixSuggestions),
  segment: one(segments, {
    fields: [findings.segmentId],
    references: [segments.id],
  }),
  project: one(projects, {
    fields: [findings.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [findings.tenantId],
    references: [tenants.id],
  }),
  reviewSession: one(reviewSessions, {
    fields: [findings.reviewSessionId],
    references: [reviewSessions.id],
  }),
  file: one(files, {
    fields: [findings.fileId],
    references: [files.id],
  }),
}))

export const filesRelations = relations(files, ({ one, many }) => ({
  findingAssignments: many(findingAssignments),
  parityReports: many(parityReports),
  scores: many(scores),
  reviewActions: many(reviewActions),
  feedbackEvents: many(feedbackEvents),
  runMetadata: many(runMetadata),
  fileAssignments: many(fileAssignments),
  aiUsageLogs: many(aiUsageLogs),
  segments: many(segments),
  project: one(projects, {
    fields: [files.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [files.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [files.uploadedBy],
    references: [users.id],
  }),
  uploadBatch: one(uploadBatches, {
    fields: [files.batchId],
    references: [uploadBatches.id],
  }),
  findings: many(findings),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  findingAssignments: many(findingAssignments),
  parityReports: many(parityReports),
  missingCheckReports: many(missingCheckReports),
  tenant: one(tenants, {
    fields: [projects.tenantId],
    references: [tenants.id],
  }),
  scores: many(scores),
  reviewSessions: many(reviewSessions),
  reviewActions: many(reviewActions),
  glossaries: many(glossaries),
  feedbackEvents: many(feedbackEvents),
  runMetadata: many(runMetadata),
  suppressionRules: many(suppressionRules),
  fileAssignments: many(fileAssignments),
  aiUsageLogs: many(aiUsageLogs),
  segments: many(segments),
  exportedReports: many(exportedReports),
  auditResults: many(auditResults),
  aiMetricsTimeseries: many(aiMetricsTimeseries),
  selfHealingConfigs: many(selfHealingConfig),
  uploadBatches: many(uploadBatches),
  files: many(files),
  findings: many(findings),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  findingAssignments_assignedTo: many(findingAssignments, {
    relationName: 'findingAssignments_assignedTo_users_id',
  }),
  findingAssignments_assignedBy: many(findingAssignments, {
    relationName: 'findingAssignments_assignedBy_users_id',
  }),
  findingComments: many(findingComments),
  parityReports: many(parityReports),
  missingCheckReports_reportedBy: many(missingCheckReports, {
    relationName: 'missingCheckReports_reportedBy_users_id',
  }),
  missingCheckReports_resolvedBy: many(missingCheckReports, {
    relationName: 'missingCheckReports_resolvedBy_users_id',
  }),
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  reviewSessions: many(reviewSessions),
  reviewActions: many(reviewActions),
  feedbackEvents: many(feedbackEvents),
  suppressionRules: many(suppressionRules),
  fileAssignments_assignedTo: many(fileAssignments, {
    relationName: 'fileAssignments_assignedTo_users_id',
  }),
  fileAssignments_assignedBy: many(fileAssignments, {
    relationName: 'fileAssignments_assignedBy_users_id',
  }),
  userRoles: many(userRoles),
  notifications: many(notifications),
  exportedReports: many(exportedReports),
  uploadBatches: many(uploadBatches),
  files: many(files),
  auditLogs202603s: many(auditLogs202603),
  auditLogs202602s: many(auditLogs202602),
  auditLogs202604s: many(auditLogs202604),
  auditLogs202605s: many(auditLogs202605),
  auditLogs202606s: many(auditLogs202606),
}))

export const findingCommentsRelations = relations(findingComments, ({ one }) => ({
  finding: one(findings, {
    fields: [findingComments.findingId],
    references: [findings.id],
  }),
  findingAssignment: one(findingAssignments, {
    fields: [findingComments.findingAssignmentId],
    references: [findingAssignments.id],
  }),
  tenant: one(tenants, {
    fields: [findingComments.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [findingComments.authorId],
    references: [users.id],
  }),
}))

export const parityReportsRelations = relations(parityReports, ({ one }) => ({
  project: one(projects, {
    fields: [parityReports.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [parityReports.tenantId],
    references: [tenants.id],
  }),
  file: one(files, {
    fields: [parityReports.fileId],
    references: [files.id],
  }),
  user: one(users, {
    fields: [parityReports.generatedBy],
    references: [users.id],
  }),
}))

export const missingCheckReportsRelations = relations(missingCheckReports, ({ one }) => ({
  project: one(projects, {
    fields: [missingCheckReports.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [missingCheckReports.tenantId],
    references: [tenants.id],
  }),
  user_reportedBy: one(users, {
    fields: [missingCheckReports.reportedBy],
    references: [users.id],
    relationName: 'missingCheckReports_reportedBy_users_id',
  }),
  user_resolvedBy: one(users, {
    fields: [missingCheckReports.resolvedBy],
    references: [users.id],
    relationName: 'missingCheckReports_resolvedBy_users_id',
  }),
}))

export const scoresRelations = relations(scores, ({ one }) => ({
  file: one(files, {
    fields: [scores.fileId],
    references: [files.id],
  }),
  project: one(projects, {
    fields: [scores.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [scores.tenantId],
    references: [tenants.id],
  }),
}))

export const reviewSessionsRelations = relations(reviewSessions, ({ one, many }) => ({
  project: one(projects, {
    fields: [reviewSessions.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [reviewSessions.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [reviewSessions.reviewerId],
    references: [users.id],
  }),
  findings: many(findings),
}))

export const reviewActionsRelations = relations(reviewActions, ({ one }) => ({
  finding: one(findings, {
    fields: [reviewActions.findingId],
    references: [findings.id],
  }),
  file: one(files, {
    fields: [reviewActions.fileId],
    references: [files.id],
  }),
  project: one(projects, {
    fields: [reviewActions.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [reviewActions.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [reviewActions.userId],
    references: [users.id],
  }),
}))

export const glossariesRelations = relations(glossaries, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [glossaries.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [glossaries.projectId],
    references: [projects.id],
  }),
  glossaryTerms: many(glossaryTerms),
}))

export const languagePairConfigsRelations = relations(languagePairConfigs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [languagePairConfigs.tenantId],
    references: [tenants.id],
  }),
}))

export const severityConfigsRelations = relations(severityConfigs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [severityConfigs.tenantId],
    references: [tenants.id],
  }),
}))

export const feedbackEventsRelations = relations(feedbackEvents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [feedbackEvents.tenantId],
    references: [tenants.id],
  }),
  finding: one(findings, {
    fields: [feedbackEvents.findingId],
    references: [findings.id],
  }),
  file: one(files, {
    fields: [feedbackEvents.fileId],
    references: [files.id],
  }),
  project: one(projects, {
    fields: [feedbackEvents.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [feedbackEvents.reviewerId],
    references: [users.id],
  }),
}))

export const runMetadataRelations = relations(runMetadata, ({ one }) => ({
  file: one(files, {
    fields: [runMetadata.fileId],
    references: [files.id],
  }),
  project: one(projects, {
    fields: [runMetadata.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [runMetadata.tenantId],
    references: [tenants.id],
  }),
}))

export const suppressionRulesRelations = relations(suppressionRules, ({ one }) => ({
  project: one(projects, {
    fields: [suppressionRules.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [suppressionRules.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [suppressionRules.createdBy],
    references: [users.id],
  }),
}))

export const fileAssignmentsRelations = relations(fileAssignments, ({ one }) => ({
  file: one(files, {
    fields: [fileAssignments.fileId],
    references: [files.id],
  }),
  project: one(projects, {
    fields: [fileAssignments.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [fileAssignments.tenantId],
    references: [tenants.id],
  }),
  user_assignedTo: one(users, {
    fields: [fileAssignments.assignedTo],
    references: [users.id],
    relationName: 'fileAssignments_assignedTo_users_id',
  }),
  user_assignedBy: one(users, {
    fields: [fileAssignments.assignedBy],
    references: [users.id],
    relationName: 'fileAssignments_assignedBy_users_id',
  }),
}))

export const aiUsageLogsRelations = relations(aiUsageLogs, ({ one }) => ({
  file: one(files, {
    fields: [aiUsageLogs.fileId],
    references: [files.id],
  }),
  project: one(projects, {
    fields: [aiUsageLogs.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [aiUsageLogs.tenantId],
    references: [tenants.id],
  }),
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [userRoles.tenantId],
    references: [tenants.id],
  }),
}))

export const glossaryTermsRelations = relations(glossaryTerms, ({ one }) => ({
  glossary: one(glossaries, {
    fields: [glossaryTerms.glossaryId],
    references: [glossaries.id],
  }),
  tenant: one(tenants, {
    fields: [glossaryTerms.tenantId],
    references: [tenants.id],
  }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notifications.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}))

export const exportedReportsRelations = relations(exportedReports, ({ one }) => ({
  project: one(projects, {
    fields: [exportedReports.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [exportedReports.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [exportedReports.generatedBy],
    references: [users.id],
  }),
}))

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

export const uploadBatchesRelations = relations(uploadBatches, ({ one, many }) => ({
  project: one(projects, {
    fields: [uploadBatches.projectId],
    references: [projects.id],
  }),
  tenant: one(tenants, {
    fields: [uploadBatches.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [uploadBatches.createdBy],
    references: [users.id],
  }),
  files: many(files),
}))

export const auditLogs202603Relations = relations(auditLogs202603, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditLogs202603.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [auditLogs202603.userId],
    references: [users.id],
  }),
}))

export const auditLogs202602Relations = relations(auditLogs202602, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditLogs202602.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [auditLogs202602.userId],
    references: [users.id],
  }),
}))

export const auditLogs202604Relations = relations(auditLogs202604, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditLogs202604.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [auditLogs202604.userId],
    references: [users.id],
  }),
}))

export const auditLogs202605Relations = relations(auditLogs202605, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditLogs202605.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [auditLogs202605.userId],
    references: [users.id],
  }),
}))

export const auditLogs202606Relations = relations(auditLogs202606, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditLogs202606.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [auditLogs202606.userId],
    references: [users.id],
  }),
}))
