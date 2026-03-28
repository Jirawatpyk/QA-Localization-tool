// Barrel export for all schemas — architecture-approved exception to no-barrel rule
// 33 tables + relations

export { tenants } from './tenants'
export { users } from './users'
export { userRoles } from './userRoles'
export { projects } from './projects'
export { files } from './files'
export { uploadBatches } from './uploadBatches'
export { segments } from './segments'
export { findings } from './findings'
export { scores } from './scores'
export { reviewSessions } from './reviewSessions'
export { reviewActions } from './reviewActions'
export { glossaries } from './glossaries'
export { glossaryTerms } from './glossaryTerms'
export { languagePairConfigs } from './languagePairConfigs'
export { severityConfigs } from './severityConfigs'
export { taxonomyDefinitions } from './taxonomyDefinitions'
export { auditLogs } from './auditLogs'
export { aiUsageLogs } from './aiUsageLogs'
export { feedbackEvents } from './feedbackEvents'
export { runMetadata } from './runMetadata'
export { suppressionRules } from './suppressionRules'
export { fileAssignments } from './fileAssignments'
export { findingAssignments } from './findingAssignments'
export { findingComments } from './findingComments'
export { notifications } from './notifications'
export { exportedReports } from './exportedReports'
export { auditResults } from './auditResults'
export { aiMetricsTimeseries } from './aiMetricsTimeseries'
export { fixSuggestions } from './fixSuggestions'
export { selfHealingConfig } from './selfHealingConfig'
export { parityReports } from './parityReports'
export { missingCheckReports } from './missingCheckReports'
export { backTranslationCache } from './backTranslationCache'

// Relations
export {
  tenantsRelations,
  usersRelations,
  userRolesRelations,
  projectsRelations,
  filesRelations,
  uploadBatchesRelations,
  segmentsRelations,
  findingsRelations,
  scoresRelations,
  reviewSessionsRelations,
  reviewActionsRelations,
  glossariesRelations,
  glossaryTermsRelations,
  languagePairConfigsRelations,
  severityConfigsRelations,
  auditLogsRelations,
  aiUsageLogsRelations,
  feedbackEventsRelations,
  runMetadataRelations,
  suppressionRulesRelations,
  fileAssignmentsRelations,
  findingAssignmentsRelations,
  findingCommentsRelations,
  notificationsRelations,
  exportedReportsRelations,
  auditResultsRelations,
  aiMetricsTimeseriesRelations,
  fixSuggestionsRelations,
  selfHealingConfigRelations,
  parityReportsRelations,
  missingCheckReportsRelations,
  backTranslationCacheRelations,
} from './relations'
