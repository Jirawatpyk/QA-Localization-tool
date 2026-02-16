// App-wide constants
// 15MB limit: Vercel 1024MB - parser 6-10x overhead (Decision 1.6)
export const MAX_FILE_SIZE_BYTES = 15_728_640

export const DEFAULT_BATCH_SIZE = 50

export const SIDEBAR_WIDTH = 240
export const SIDEBAR_WIDTH_COLLAPSED = 48
export const DETAIL_PANEL_WIDTH = 400
export const CONTENT_MAX_WIDTH = 1400

export const SCORE_DEBOUNCE_MS = 500

export const RATE_LIMIT_WINDOW_MS = 60_000
export const RATE_LIMIT_MAX_REQUESTS = 100
