/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { getUltraworkMessage, getUltraworkSource } from "./index"
import type { UltraworkSource } from "./source-detector"

type UltraworkPromptBaseline = {
  readonly name: string
  readonly agentName: string
  readonly modelID: string
  readonly expectedSource: UltraworkSource
  readonly sha256: string
}

const ULTRAWORK_PROMPT_BASELINES: readonly UltraworkPromptBaseline[] = [
  {
    name: "default",
    agentName: "sisyphus",
    modelID: "claude-sonnet-4-6",
    expectedSource: "default",
    sha256: "8aa96197ebbd87cb251e203898efc87e89eca14500b5d0a843f2b97d6c269eee",
  },
  {
    name: "gpt",
    agentName: "sisyphus",
    modelID: "gpt-5.5",
    expectedSource: "gpt",
    sha256: "f9e62643318bc5a5bcb4609bd871afbc24172517212ee8d3e91d599d994048ce",
  },
  {
    name: "gemini",
    agentName: "sisyphus",
    modelID: "gemini-3.1-pro",
    expectedSource: "gemini",
    sha256: "2ed9d3399a89b13457fe71137e9140c1a5557cd00b2d14d2fce0cec4821fa886",
  },
  {
    name: "planner",
    agentName: "prometheus",
    modelID: "gpt-5.5",
    expectedSource: "planner",
    sha256: "8897b3a11b61c12a02bfba13a76c80742bc4e5356cfc30e2f0c38464aa587bf3",
  },
]

describe("Ultrawork prompt byte exactness", () => {
  test("#given captured ultrawork prompt baselines #then every routed source keeps the same bytes", () => {
    for (const baseline of ULTRAWORK_PROMPT_BASELINES) {
      const source = getUltraworkSource(baseline.agentName, baseline.modelID)
      const prompt = getUltraworkMessage(baseline.agentName, baseline.modelID)

      expect(source, baseline.name).toBe(baseline.expectedSource)
      expect(prompt.length, baseline.name).toBeGreaterThan(0)
      expect(hashPrompt(prompt), baseline.name).toBe(baseline.sha256)
    }
  })
})

function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex")
}
