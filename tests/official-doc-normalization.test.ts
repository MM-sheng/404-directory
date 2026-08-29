import { describe, expect, it } from "vitest"
import { normalizeOfficialDocSearchResult } from "../src/mcp/discovery-tools.js"

describe("official documentation provider response contracts", () => {
  it.each([
    [{ results: [] }, "empty"],
    [{ content: { result: [] } }, "empty"],
    [
      { results: [{ unexpected: "changed provider contract" }] },
      "unrecognized",
    ],
    [{ unexpected: { values: [] } }, "unrecognized"],
  ])(
    "distinguishes zero matches from unsupported responses",
    (payload, status) => {
      expect(
        normalizeOfficialDocSearchResult(
          {
            is_error: false,
            truncated: false,
            content: [{ type: "text", text: JSON.stringify(payload) }],
          },
          1
        )
      ).toMatchObject({ documents: [], result_status: status })
    }
  )

  it("preserves limits and deduplicates provider citations", () => {
    const entries = ["one", "one", "two", "three"].map((id) => ({
      contentUrl: `https://learn.microsoft.com/${id}`,
      title: id,
      content: "long ".repeat(300),
    }))
    const result = normalizeOfficialDocSearchResult(
      {
        is_error: false,
        truncated: false,
        content: [{ type: "text", text: JSON.stringify({ results: entries }) }],
      },
      2
    )
    expect(result.documents.map((d) => d.title)).toEqual(["one", "two"])
    expect(result.documents.every((d) => (d.snippet?.length ?? 0) <= 600)).toBe(
      true
    )
    expect(result.truncated).toBe(true)
  })
  it.each([
    [
      "microsoft",
      {
        results: [
          {
            title: "MCP on Azure",
            contentUrl:
              "https://learn.microsoft.com/azure/container-apps/mcp-overview",
            content: "Azure transport guidance",
          },
        ],
      },
      "https://learn.microsoft.com/azure/container-apps/mcp-overview",
      "Azure transport guidance",
    ],
    [
      "aws",
      {
        content: {
          result: [
            {
              title: "MCP on AWS",
              url: "https://aws.amazon.com/blogs/opensource/mcp/",
              context: "AWS transport guidance",
            },
          ],
        },
      },
      "https://aws.amazon.com/blogs/opensource/mcp/",
      "AWS transport guidance",
    ],
  ])(
    "preserves %s URLs and evidence text",
    (_source, payload, url, snippet) => {
      for (const structured of [false, true]) {
        const normalized = normalizeOfficialDocSearchResult(
          {
            is_error: false,
            truncated: false,
            content: structured
              ? []
              : [{ type: "text", text: JSON.stringify(payload) }],
            ...(structured
              ? { structured_content: payload as Record<string, unknown> }
              : {}),
          },
          1
        )
        expect(normalized.documents).toEqual([
          expect.objectContaining({ url, snippet }),
        ])
      }
    }
  )
})
