/**
 * Extracts a human-readable error message from a failed fetch response.
 * Handles gateway errors, network failures, and Pydantic validation arrays.
 */
export async function getApiError(res: Response, fallback: string): Promise<string> {
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return 'The server is temporarily unavailable. Please try again in a moment.'
  }
  try {
    const data = await res.json()
    const detail = (data as { detail?: unknown }).detail
    if (Array.isArray(detail)) return 'Please enter a valid email address.'
    if (typeof detail === 'string') return detail
  } catch {
    // Non-JSON response body
  }
  return fallback
}

export function getNetworkError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TypeError') return 'Could not reach the server. Check your connection and try again.'
    return err.message
  }
  return 'Something went wrong.'
}
