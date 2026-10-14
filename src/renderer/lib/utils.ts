import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * An error from a `window.desktop` call, as the handler in main worded it.
 * Electron wraps a rejected handler as "Error invoking remote method
 * 'portfolio:add': Error: …", which is the channel name talking, not the app.
 */
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(
    /^Error invoking remote method '[^']+': (?:\w*Error: )?/,
    ""
  )
}
