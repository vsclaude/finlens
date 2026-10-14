/**
 * The analyst's model picker, the half both sides need: what a model row is,
 * the list drawn when the CLI could not be asked, and the rules for ordering
 * rows and landing a pick on an effort level. Main narrows the SDK's answer
 * with `readModel`; the renderer draws the rest.
 */

export const AI_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const

export type AiEffort = (typeof AI_EFFORTS)[number]

/**
 * The level a pick lands on when the model takes levels and none was chosen
 * yet. A level rather than "let the CLI decide", so the toolbar always says how
 * hard the analyst is thinking; `medium` because it is what an unconfigured
 * Claude Code runs at.
 */
export const DEFAULT_AI_EFFORT: AiEffort = "medium"

/**
 * One row of the picker. `value` goes to the SDK's `model`; `label` and
 * `description` are the CLI's own words, so the picker cannot describe a model
 * differently from the tool that runs it.
 */
export type AgentModel = {
  value: string
  /** The wire id behind `value` — what tells `default` apart as a model. */
  resolvedModel?: string
  label: string
  description: string
  /** Weakest first; empty for a model that takes no effort. */
  efforts: AiEffort[]
  /** The fallback's own place in the menu; the CLI's rows go by name. */
  order?: number
}

/**
 * What the picker draws when the CLI could not be asked — not installed yet, or
 * a spawn that timed out. Three aliases and not a guess at this account's list:
 * which models exist is a property of the account, and a row the account does
 * not have fails a turn after somebody has typed a question. No effort levels,
 * for the same reason.
 */
export const AI_MODEL_FALLBACK: AgentModel[] = [
  {
    value: "opus",
    label: "Opus",
    description: "Phân tích sâu nhất",
    efforts: [],
    order: 1,
  },
  {
    value: "sonnet",
    label: "Sonnet",
    description: "Cân bằng tốc độ và chiều sâu",
    efforts: [],
    order: 2,
  },
  {
    value: "haiku",
    label: "Haiku",
    description: "Nhanh, rẻ",
    efforts: [],
    order: 3,
  },
]

/**
 * One row of the SDK's `supportedModels()`, narrowed to what the picker draws.
 * Levels are filtered against `AI_EFFORTS` rather than trusted, so a CLI that
 * grows a sixth level cannot put a word in the menu this app has no label for.
 */
export function readModel(model: {
  value: string
  resolvedModel?: string
  displayName: string
  description: string
  supportsEffort?: boolean
  supportedEffortLevels?: string[]
}): AgentModel {
  const levels = model.supportsEffort ? (model.supportedEffortLevels ?? []) : []
  return {
    value: model.value,
    ...(model.resolvedModel ? { resolvedModel: model.resolvedModel } : {}),
    label: model.displayName,
    description: model.description,
    efforts: levels.filter((level): level is AiEffort =>
      (AI_EFFORTS as readonly string[]).includes(level)
    ),
  }
}

/**
 * The order the menu draws them in. The CLI answers in an order of its own,
 * which reads as a bug in a menu: `default` keeps the top — it is the CLI's
 * recommendation — and the rest go by name, not by any ranking this app would
 * be inventing.
 */
export function orderedModels(models: AgentModel[]): AgentModel[] {
  return [...models].sort((left, right) => {
    if (left.value === "default") return -1
    if (right.value === "default") return 1
    if (left.order !== undefined && right.order !== undefined)
      return left.order - right.order
    if (left.order !== undefined) return -1
    if (right.order !== undefined) return 1
    return left.label.localeCompare(right.label)
  })
}

/**
 * What the CLI's `default` row is, by a name somebody recognises: the alias row
 * that resolves to the same wire id. Null where that cannot be said honestly,
 * which draws the row without a suffix rather than with a wrong one.
 */
export function defaultModelAlias(models: AgentModel[]): string | null {
  const fallback = models.find((entry) => entry.value === "default")
  if (!fallback?.resolvedModel) return null
  const named = models.find(
    (entry) =>
      entry.value !== "default" &&
      entry.resolvedModel === fallback.resolvedModel
  )
  return named?.label ?? null
}

/** The levels `value` takes, or none for a model the list does not have. */
export function effortsOf(models: AgentModel[], value: string): AiEffort[] {
  return models.find((entry) => entry.value === value)?.efforts ?? []
}

/**
 * The level a pick lands on. Keeps the one already chosen where the new model
 * takes it — Sonnet to Opus is no reason to lose `xhigh` — falls to the
 * default otherwise, or to the strongest level a shorter list has.
 */
export function effortFor(
  levels: AiEffort[],
  effort: AiEffort | null
): AiEffort | null {
  if (levels.length === 0) return null
  if (effort && levels.includes(effort)) return effort
  if (levels.includes(DEFAULT_AI_EFFORT)) return DEFAULT_AI_EFFORT
  return levels[levels.length - 1] ?? null
}
