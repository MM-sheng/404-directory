import type { AgentPageModel, Evidence } from "../schemas/agent-page-model.js"

function searchable(evidence: Evidence): string {
  return [
    evidence.source,
    evidence.field,
    evidence.role,
    evidence.label,
    evidence.raw_value === undefined
      ? undefined
      : JSON.stringify(evidence.raw_value),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function matchingEvidenceIds(
  evidence: Array<Evidence & { id: string }>,
  term: string,
  preferredSources: Evidence["source"][]
): string[] {
  const normalized = term.trim().toLowerCase()
  const direct = normalized
    ? evidence.filter((item) => searchable(item).includes(normalized))
    : []
  const fallback = evidence.filter((item) =>
    preferredSources.includes(item.source)
  )
  return [...new Set([...direct, ...fallback].map((item) => item.id))].slice(
    0,
    5
  )
}

/** Adds stable, low-token Claim -> Evidence links without changing extraction. */
export function linkPageModelEvidence(model: AgentPageModel): AgentPageModel {
  const evidence = model.evidence.map((item, index) => ({
    ...item,
    id: item.id ?? `e${index + 1}`,
    supports: [...(item.supports ?? [])],
  }))

  const entities = model.entities.map((entity, index) => {
    const evidenceIds = matchingEvidenceIds(evidence, entity.name, [
      "json_ld",
      "semantic_dom",
      "visible_text",
      "title",
    ])
    for (const id of evidenceIds) {
      evidence
        .find((item) => item.id === id)
        ?.supports?.push(`entities.${index}`)
    }
    return { ...entity, evidence_ids: evidenceIds }
  })

  const actions = model.actions.map((action, index) => {
    const evidenceIds = matchingEvidenceIds(evidence, action.label, [
      "control",
      "form",
      "link",
      "accessibility",
    ])
    for (const id of evidenceIds) {
      evidence
        .find((item) => item.id === id)
        ?.supports?.push(`actions.${index}`)
    }
    return { ...action, evidence_ids: evidenceIds }
  })

  const stateEvidenceIds = matchingEvidenceIds(
    evidence,
    model.state.login_status,
    ["url", "title", "meta", "visible_text", "semantic_dom"]
  )
  for (const id of stateEvidenceIds) {
    evidence.find((item) => item.id === id)?.supports?.push("state")
  }

  return {
    ...model,
    entities,
    state: { ...model.state, evidence_ids: stateEvidenceIds },
    actions,
    evidence: evidence.map((item) => ({
      ...item,
      supports: [...new Set(item.supports)],
    })),
  }
}
