'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { EXCEL_PREVIEW_ROWS } from '@/features/parser/constants'
import { autoDetectColumns, extractCellValue } from '@/features/parser/excelParser'
import { requireRole } from '@/lib/auth/requireRole'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ActionResult } from '@/types/actionResult'

export type ExcelPreview = {
  headers: string[]
  previewRows: string[][]
  suggestedSourceColumn: string | null
  suggestedTargetColumn: string | null
  totalRows: number
  columnCount: number
}

/**
 * Server Action: download Excel file from Storage → read first N rows + headers
 * → return preview data + auto-detect column suggestions.
 */
export async function previewExcelColumns(fileId: string): Promise<ActionResult<ExcelPreview>> {
  // C3: Validate fileId is a valid UUID before any DB/storage access
  if (!z.string().uuid().safeParse(fileId).success) {
    return { success: false, code: 'INVALID_INPUT', error: 'Invalid file ID format' }
  }

  // Auth check (M3 pattern)
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions to preview files' }
  }

  // Tenant-scoped file lookup with ownership check
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), withTenant(files.tenantId, currentUser.tenantId)))
    .limit(1)

  if (!file) {
    return { success: false, code: 'NOT_FOUND', error: 'File not found or access denied' }
  }

  if (file.fileType !== 'xlsx') {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Preview is only available for Excel (.xlsx) files',
    }
  }

  // Download file from Supabase Storage
  const admin = createAdminClient()
  const { data: blob, error: downloadError } = await admin.storage
    .from('project-files')
    .download(file.storagePath)

  if (downloadError || !blob) {
    return {
      success: false,
      code: 'STORAGE_ERROR',
      error: `Failed to download file from storage: ${downloadError?.message ?? 'unknown error'}`,
    }
  }

  let buffer: ArrayBuffer
  try {
    buffer = await blob.arrayBuffer()
  } catch {
    return {
      success: false,
      code: 'STORAGE_ERROR',
      error: 'Failed to read file content from storage blob',
    }
  }

  // Load Excel and read preview rows
  const workbook = new ExcelJS.Workbook()
  try {
    // @ts-expect-error — ExcelJS types expect legacy Buffer; Node.js 20+ returns Buffer<ArrayBufferLike>
    await workbook.xlsx.load(Buffer.from(new Uint8Array(buffer)))
  } catch {
    return {
      success: false,
      code: 'PARSE_ERROR',
      error: 'Invalid Excel file — could not read spreadsheet',
    }
  }

  const worksheet = workbook.getWorksheet(1)
  if (!worksheet) {
    return {
      success: false,
      code: 'PARSE_ERROR',
      error: 'Excel file has no worksheets',
    }
  }

  // Read header row (row 1) — get column headers
  const headerRow = worksheet.getRow(1)
  const headers: string[] = []
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    headers.push(extractCellValue(cell))
  })

  // Calculate total data rows (excluding header)
  const totalRows = Math.max(0, worksheet.rowCount - 1)
  const columnCount = headers.length

  // Read preview rows (first EXCEL_PREVIEW_ROWS data rows, starting from row 2)
  const previewRows: string[][] = []
  const endRow = Math.min(worksheet.rowCount, EXCEL_PREVIEW_ROWS + 1)

  for (let rowNum = 2; rowNum <= endRow; rowNum++) {
    const row = worksheet.getRow(rowNum)
    const rowData: string[] = []
    for (let col = 1; col <= columnCount; col++) {
      rowData.push(extractCellValue(row.getCell(col)))
    }
    previewRows.push(rowData)
  }

  // Auto-detect source/target columns
  const { suggestedSourceColumn, suggestedTargetColumn } = autoDetectColumns(headers)

  return {
    success: true,
    data: {
      headers,
      previewRows,
      suggestedSourceColumn,
      suggestedTargetColumn,
      totalRows,
      columnCount,
    },
  }
}
