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
    sha256: "05e00601ede955f6ce0a3a0287701ae5f3f17e9c9c8284cb29c58ddf00e86dec",
  },
  {
    name: "gpt",
    agentName: "sisyphus",
    modelID: "gpt-5.5",
    expectedSource: "gpt",
    sha256: "be5ce4a078fe927c7feb92d75b34179e6d8a294577aba6a046de76e0990a4717",
  },
  {
    name: "gemini",
    agentName: "sisyphus",
    modelID: "gemini-3.1-pro",
    expectedSource: "gemini",
    sha256: "acbbee7b25b3f205cee5c5bd5b79438a30fef41f08c029d239043013d361779c",
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
