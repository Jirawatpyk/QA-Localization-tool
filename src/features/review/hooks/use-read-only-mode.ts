import { createContext, useContext } from 'react'

type ReadOnlyContextValue = {
  isReadOnly: boolean
}

export const ReadOnlyContext = createContext<ReadOnlyContextValue>({ isReadOnly: false })

export function useReadOnlyMode(): boolean {
  return useContext(ReadOnlyContext).isReadOnly
}
