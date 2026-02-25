'use client'

type ParityFinding = {
  id: string
  description: string
  segmentNumber: number
  severity: string
  category: string
}

type ParityResults = {
  bothFound: ParityFinding[]
  toolOnly: ParityFinding[]
  xbenchOnly: ParityFinding[]
}

type ParityResultsTableProps = {
  results: ParityResults
}

function FindingRow({ finding }: { finding: ParityFinding }) {
  return (
    <tr className="border-b">
      <td className="px-3 py-2 text-sm">{finding.segmentNumber}</td>
      <td className="px-3 py-2 text-sm">{finding.category}</td>
      <td className="px-3 py-2 text-sm">{finding.severity}</td>
      <td className="px-3 py-2 text-sm">{finding.description}</td>
    </tr>
  )
}

function ResultSection({
  title,
  findings,
  colorClass,
}: {
  title: string
  findings: ParityFinding[]
  colorClass: string
}) {
  return (
    <section>
      <h3 className={`mb-2 text-lg font-semibold ${colorClass}`}>
        {title} ({findings.length})
      </h3>
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No findings</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b px-3 py-1 text-left text-xs font-medium">Seg</th>
              <th className="border-b px-3 py-1 text-left text-xs font-medium">Category</th>
              <th className="border-b px-3 py-1 text-left text-xs font-medium">Severity</th>
              <th className="border-b px-3 py-1 text-left text-xs font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function ParityResultsTable({ results }: ParityResultsTableProps) {
  return (
    <div className="space-y-6">
      <ResultSection title="Both Found" findings={results.bothFound} colorClass="text-success" />
      <ResultSection title="Tool Only" findings={results.toolOnly} colorClass="text-info" />
      <ResultSection
        title="Xbench Only"
        findings={results.xbenchOnly}
        colorClass="text-destructive"
      />
    </div>
  )
}
