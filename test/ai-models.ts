/**
 * The model picker's rules: narrowing the CLI's answer, the menu's order, the
 * name behind `default`, and which effort level a pick lands on.
 */
import {
  defaultModelAlias,
  effortFor,
  orderedModels,
  readModel,
  type AgentModel,
} from "../src/shared/ai-models"
import { check, finish, section } from "./harness"

section("readModel")
const opus = readModel({
  value: "opus",
  resolvedModel: "claude-opus-5-5",
  displayName: "Opus",
  description: "Most capable",
  supportsEffort: true,
  supportedEffortLevels: ["low", "medium", "high", "ultra", "max"],
})
check(
  "keeps the levels it knows, weakest first",
  opus.efforts.join() === "low,medium,high,max",
  opus.efforts
)
const haiku = readModel({
  value: "haiku",
  displayName: "Haiku",
  description: "Fast",
  supportsEffort: false,
  supportedEffortLevels: ["low"],
})
check("no effort support means no levels", haiku.efforts.length === 0)
check("no resolvedModel key when none was sent", !("resolvedModel" in haiku))

section("orderedModels")
const rows: AgentModel[] = [
  { value: "sonnet", label: "Sonnet", description: "", efforts: [] },
  {
    value: "default",
    label: "Default (recommended)",
    description: "",
    efforts: [],
    resolvedModel: "claude-sonnet-5-5",
  },
  { value: "haiku", label: "Haiku", description: "", efforts: [] },
  {
    value: "sonnet-id",
    label: "Sonnet 5.5",
    description: "",
    efforts: [],
    resolvedModel: "claude-sonnet-5-5",
  },
]
const order = orderedModels(rows).map((each) => each.value)
check(
  "default first, the rest by name",
  order.join() === "default,haiku,sonnet,sonnet-id",
  order
)

section("defaultModelAlias")
check(
  "names the row sharing default's wire id",
  defaultModelAlias(rows) === "Sonnet 5.5",
  defaultModelAlias(rows)
)
check(
  "null when default resolves to nothing",
  defaultModelAlias(rows.filter((each) => each.value !== "sonnet-id")) === null
)

section("effortFor")
check("a model with no levels gets none", effortFor([], "high") === null)
check(
  "keeps a level the model takes",
  effortFor(["low", "medium", "high", "xhigh"], "xhigh") === "xhigh"
)
check(
  "falls to the default otherwise",
  effortFor(["low", "medium", "high"], "max") === "medium"
)
check("or the strongest of a short list", effortFor(["low"], null) === "low")

finish()
