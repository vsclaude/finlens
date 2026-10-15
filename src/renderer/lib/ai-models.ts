import { useEffect, useState } from "react"

import { AI_MODEL_FALLBACK, type AgentModel } from "@shared/ai-models"

/** Shared by every picker in the window: the promise, so two mounting at
 * once make one call, and the answer, so a later one makes none. */
let asked: Promise<AgentModel[]> | null = null
let held: AgentModel[] | null = null

/**
 * The models the analyst's Claude Code offers. Asked on mount rather than when
 * the menu opens, because the button draws the chosen model's *name*, and a
 * button that says `opus` until somebody clicks it was waiting for nothing.
 * The fallback stands in while asking and whenever the answer was empty.
 */
export function useAiModels(): AgentModel[] {
  const [models, setModels] = useState(held ?? AI_MODEL_FALLBACK)

  useEffect(() => {
    if (held) return
    let mounted = true
    asked ??= window.desktop.listAiModels()
    void asked
      .then((answer) => {
        // An empty answer is not held, so the next picker asks again — a
        // login made after launch is then found without a restart.
        if (answer.length === 0) asked = null
        else held = answer
        if (mounted) setModels(held ?? AI_MODEL_FALLBACK)
      })
      .catch(() => {
        asked = null
      })
    return () => {
      mounted = false
    }
  }, [])

  return models
}
