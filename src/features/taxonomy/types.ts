import type { Severity } from '@/features/taxonomy/validation/taxonomySchemas'

export type { Severity }

export type TaxonomyMapping = {
  id: string
  category: string
  parentCategory: string | null
  internalName: string | null
  severity: Severity | null
  description: string
  isCustom: boolean
  isActive: boolean
  displayOrder: number
  createdAt: Date
  updatedAt: Date
}
