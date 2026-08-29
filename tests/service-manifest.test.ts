import { describe, expect, it, vi } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { loadConfig } from "../src/config.js"
import { buildApp } from "../src/http/app.js"
import { MemoryCatalogStore } from "../src/domain/memory-store.js"
import { ToolRegistry } from "../src/tools/registry.js"
import { createVerifyWebTool } from "../src/tools/definitions/verify-web.js"
import { createUnderstandWebpageTool } from "../src/tools/definitions/understand-webpage.js"
import { UnderstandService } from "../src/understand.js"
import { PageCollector } from "../src/browser/collector.js"
import { BrowserManager } from "../src/browser/browser-manager.js"

describe("advertised and callable service manifest", () => {
  it("can start without any tools or prompts and advertises an empty inventory", async () => {
    const app = await buildApp(
      new ToolRegistry(),
      loadConfig({ REGISTRY_ADMIN_TOKEN: "manifest-local-test-only" })
    )
    try {
      expect(
        (await app.inject({ method: "GET", url: "/tools" })).json()
      ).toEqual({ tools: [] })
      const card = (
        await app.inject({
          method: "GET",
          url: "/.well-known/mcp/server-card.json",
        })
      ).json()
      expect(card.tools).toEqual([])
      expect(card.prompts).toEqual([])
      const connect = (await app.inject({ method: "GET", url: "/connect.md" }))
        .body
      expect(connect).toContain("No tools are enabled")
      expect(connect).not.toContain("evaluate_prediction_market")
      expect(connect).not.toContain("call `verify_web`")
    } finally {
      await app.close()
    }
  })

  it.each([
    { catalogEnabled: true, gatewayEnabled: true, expected: 16 },
    { catalogEnabled: true, gatewayEnabled: false, expected: 13 },
    { catalogEnabled: false, gatewayEnabled: true, expected: 2 },
  ])(
    "matches live MCP and only advertises enabled tools: %j",
    async ({ catalogEnabled, gatewayEnabled, expected }) => {
      const registry = new ToolRegistry().register(
        createVerifyWebTool({
          timeoutMs: 1000,
          maxBodyBytes: 1000,
          maxRedirects: 1,
        })
      )
      const browsers = new BrowserManager({
        allowedPorts: [80, 443],
        maxResourceBytes: 1000,
      })
      const service = new UnderstandService(
        new PageCollector(
          browsers,
          loadConfig({ REGISTRY_ADMIN_TOKEN: "manifest-local-test-only" })
        ),
        1000
      )
      const understand = createUnderstandWebpageTool(service)
      const handler = vi.spyOn(understand, "handler")
      registry.register(understand)
      const inactive = {
        ...understand,
        name: "disabled_probe",
        status: "disabled" as const,
        handler: async (input: unknown) =>
          understand.handler(understand.inputSchema.parse(input)),
      }
      registry.register(inactive)
      const store = catalogEnabled ? new MemoryCatalogStore() : null
      const invocations = store ? vi.spyOn(store, "recordInvocation") : null
      const activations = store
        ? vi.spyOn(store, "recordActivationEvent")
        : null
      const app = await buildApp(
        registry,
        loadConfig({
          MCP_GATEWAY_ENABLED: String(gatewayEnabled),
          REGISTRY_ADMIN_TOKEN: "manifest-local-test-only",
          AGENT_ANALYTICS_SALT: "manifest-local-only",
        }),
        store
      )
      if (invocations) expect(invocations).not.toHaveBeenCalled()
      if (activations) expect(activations).not.toHaveBeenCalled()
      const client = new Client({
        name: "404-internal-manifest-test",
        version: "1",
      })
      try {
        const url = await app.listen({ host: "127.0.0.1", port: 0 })
        await client.connect(
          new StreamableHTTPClientTransport(new URL(url + "/mcp"), {
            requestInit: {
              headers: {
                "X-404-Agent-Class": "internal",
                "X-404-Agent-ID": "internal:manifest-test",
              },
            },
          })
        )
        const tools = (await client.listTools()).tools
        const prompts = (await client.listPrompts()).prompts
        expect(tools).toHaveLength(expected)
        const catalog = (
          await app.inject({ method: "GET", url: "/tools" })
        ).json()
        expect(catalog.tools.map((t: { name: string }) => t.name)).toEqual(
          tools.map((t) => t.name)
        )
        const card = (
          await app.inject({
            method: "GET",
            url: "/.well-known/mcp/server-card.json",
          })
        ).json()
        expect(card.tools).toEqual(tools)
        expect(card.prompts).toEqual(prompts)
        const docs = (await app.inject({ method: "GET", url: "/docs.md" })).body
        const home = (await app.inject({ method: "GET", url: "/" })).body
        const connect = (await app.inject({ method: "GET", url: "/connect" }))
          .body
        const connectMarkdown = (
          await app.inject({ method: "GET", url: "/connect.md" })
        ).body
        const sitemap = (
          await app.inject({ method: "GET", url: "/sitemap.xml" })
        ).body
        const spec = (
          await app.inject({ method: "GET", url: "/openapi.json" })
        ).json()
        for (const tool of tools) {
          const response = await app.inject({
            method: "GET",
            url: "/tools/" + tool.name,
          })
          expect(response.statusCode).toBe(200)
          const detail = response.json()
          expect(detail.input_schema).toEqual(tool.inputSchema)
          expect(detail.annotations).toEqual(tool.annotations)
          expect(detail.description).toEqual(tool.description)
          expect(detail.invocation.mcp).toEqual({
            endpoint: "/mcp",
            method: "tools/call",
            name: tool.name,
          })
          if (detail.invocation.rest) {
            const rest = detail.invocation.rest
            expect(
              spec.paths[rest.path]?.[rest.method.toLowerCase()]
            ).toBeDefined()
            expect(
              spec.paths[rest.path][rest.method.toLowerCase()].operationId
            ).toBe(tool.name)
            expect(
              spec.paths[rest.path][rest.method.toLowerCase()].description
            ).toContain(rest.input_mapping)
          }
          expect(docs).toContain("## " + tool.name)
          expect(home).toContain('href="/tools/' + tool.name + '"')
          expect(connect).toContain('href="/tools/' + tool.name + '"')
          expect(connectMarkdown).toContain("/tools/" + tool.name + ")")
          expect(sitemap).toContain("/tools/" + tool.name + "</loc>")
        }
        for (const path of ["/health", "/mcp-info", "/.well-known/mcp.json"]) {
          const response = (
            await app.inject({ method: "GET", url: path })
          ).json()
          expect(response.tools).toEqual(tools.map((t) => t.name))
        }
        if (!gatewayEnabled || !catalogEnabled) {
          expect(client.getInstructions()).not.toContain(
            "prefer search_official_docs"
          )
          expect(home).not.toContain("<code>search_official_docs</code>")
          expect(connect).not.toContain("search_official_docs")
          expect(connectMarkdown).not.toContain("search_official_docs")
          expect(
            (
              await app.inject({
                method: "GET",
                url: "/tools/search_official_docs",
              })
            ).statusCode
          ).toBe(404)
        } else {
          expect(
            (
              await app.inject({
                method: "GET",
                url: "/tools/search_official_docs",
              })
            ).json().invocation.rest
          ).toBeNull()
        }
        expect(
          (await app.inject({ method: "GET", url: "/tools/disabled_probe" }))
            .statusCode
        ).toBe(404)
        expect(handler).not.toHaveBeenCalled()
        if (invocations) expect(invocations).not.toHaveBeenCalled()
        if (!catalogEnabled) {
          expect(connect).not.toContain("evaluate_prediction_market")
          expect(connectMarkdown).not.toContain("evaluate_prediction_market")
        }
        if (store)
          expect(
            (await store.agentUsageSummary()).successful_external_invocations
          ).toBe(0)
      } finally {
        await client.close()
        await app.close()
      }
    }
  )
})
