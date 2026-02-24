import { EventSchemas, Inngest } from 'inngest'

type Events = {
  'pipeline.process-file': {
    data: {
      fileId: string
      projectId: string
      tenantId: string
      mode: 'economy' | 'thorough'
      uploadBatchId: string
      userId: string
    }
  }
  'pipeline.batch-started': {
    data: {
      batchId: string
      projectId: string
      tenantId: string
      fileIds: string[]
      mode: 'economy' | 'thorough'
      uploadBatchId: string
      userId: string
    }
  }
}

export const inngest = new Inngest({
  id: 'qa-localization-tool',
  schemas: new EventSchemas().fromRecord<Events>(),
})
