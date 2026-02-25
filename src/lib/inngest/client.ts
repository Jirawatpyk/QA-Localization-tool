import { EventSchemas, Inngest } from 'inngest'

import type {
  PipelineBatchCompletedEventData,
  PipelineBatchEventData,
  PipelineFileEventData,
} from '@/types/pipeline'

// Event schemas — data types canonical in @/types/pipeline to avoid drift
type Events = {
  'pipeline.process-file': { data: PipelineFileEventData }
  'pipeline.batch-started': { data: PipelineBatchEventData }
  'pipeline.batch-completed': { data: PipelineBatchCompletedEventData }
}

export const inngest = new Inngest({
  id: 'qa-localization-tool',
  schemas: new EventSchemas().fromRecord<Events>(),
})
