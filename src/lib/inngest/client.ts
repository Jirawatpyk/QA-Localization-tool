import { EventSchemas, Inngest } from 'inngest'

import type {
  FindingChangedEventData,
  PipelineBatchCompletedEventData,
  PipelineBatchEventData,
  PipelineFileEventData,
  RetryFailedLayersEventData,
  ScoreUpdatedEventData,
} from '@/types/pipeline'

// Event schemas — data types canonical in @/types/pipeline to avoid drift
type Events = {
  'pipeline.process-file': { data: PipelineFileEventData }
  'pipeline.batch-started': { data: PipelineBatchEventData }
  'pipeline.batch-completed': { data: PipelineBatchCompletedEventData }
  'finding.changed': { data: FindingChangedEventData }
  'pipeline.retry-failed-layers': { data: RetryFailedLayersEventData }
  'score.updated': { data: ScoreUpdatedEventData }
}

export const inngest = new Inngest({
  id: 'qa-localization-tool',
  schemas: new EventSchemas().fromRecord<Events>(),
})
