'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { compareWithXbench } from '@/features/parity/actions/compareWithXbench.action'

import { ParityResultsTable } from './ParityResultsTable'

type ComparisonFinding = {
  id: string
  description: string
  segmentNumber: number
  severity: string
  category: string
}

type CompareResult = {
  bothFound: ComparisonFinding[]
  toolOnly: ComparisonFinding[]
  xbenchOnly: ComparisonFinding[]
}

type ParityComparisonViewProps = {
  projectId: string
  fileId?: string
}

export function ParityComparisonView({ projectId, fileId }: ParityComparisonViewProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<CompareResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    setResults(null)
  }

  const handleCompare = async () => {
    if (!selectedFile) return

    setLoading(true)
    try {
      const buffer = await selectedFile.arrayBuffer()
      const result = await compareWithXbench({
        projectId,
        fileId,
        xbenchReportBuffer: new Uint8Array(buffer),
      })

      if (result.success) {
        setResults(result.data)
      } else {
        toast.error(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="mb-2 text-sm text-muted-foreground">
          Upload Xbench report to select and compare
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          className="text-sm"
        />
      </div>

      {selectedFile && (
        <button
          type="button"
          disabled={loading}
          onClick={handleCompare}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {loading ? 'Comparing...' : 'Compare'}
        </button>
      )}

      {results && <ParityResultsTable results={results} />}
    </div>
  )
}
