import type { IncomingMessage, RequestOptions } from "node:http"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"
import { resolvePublicHttpUrl, UnsafeUrlError } from "../security/url.js"
import type { VerifyWebRequest, VerifyWebResult } from "./schemas.js"

export type VerifyWebOptions = {
  timeoutMs: number
  maxBodyBytes: number
  maxRedirects: number
  resolveUrl?: typeof resolvePublicHttpUrl
  requestUrl?: typeof requestPinned
}

function evidenceFor(
  input: VerifyWebRequest,
  checks: VerifyWebResult["checks"]
): VerifyWebResult["evidence"] {
  const evidence: VerifyWebResult["evidence"] = [
    {
      check: "reachable",
      expected: true,
      observed: checks.reachable,
      passed: checks.reachable,
    },
    {
      check: "status",
      expected: input.expected_status,
      observed: checks.status,
      passed: checks.status === input.expected_status,
    },
    {
      check: "https",
      expected: true,
      observed: checks.https_valid,
      passed: checks.https_valid,
    },
  ]

  const expectedText = input.expected_text?.trim()
  if (expectedText) {
    evidence.push({
      check: "text",
      expected:
        expectedText.length <= 200
          ? expectedText
          : `${expectedText.slice(0, 197)}...`,
      observed: checks.text_found,
      passed: checks.text_found,
    })
  }

  return evidence
}

type FetchOutcome = {
  reachable: boolean
  status: number | null
  httpsValid: boolean
  body: string
  finalUrl?: string
  error?: string
}

type PinnedResponse = {
  status: number
  location?: string
  body: string
}

function readBodyLimited(
  response: IncomingMessage,
  maxBodyBytes: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0

    response.on("data", (chunk: Buffer) => {
      total += chunk.byteLength
      if (total > maxBodyBytes) {
        response.destroy()
        reject(new Error(`Response body exceeded ${maxBodyBytes} bytes`))
        return
      }
      chunks.push(chunk)
    })
    response.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    response.once("error", reject)
  })
}

async function requestPinned(
  url: URL,
  address: { address: string; family: number },
  signal: AbortSignal,
  maxBodyBytes: number
): Promise<PinnedResponse> {
  return new Promise((resolve, reject) => {
    const headers = {
      host: url.host,
      "user-agent": "404.directory verify_web/0.2",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-encoding": "identity",
    }
    // SNI must be a hostname; passing an IP literal makes Node's TLS stack
    // reject the request. For IP-literal URLs we omit servername and let TLS
    // validate the certificate against the IP (SAN) instead.
    const sniHost = url.hostname.replace(/^\[|\]$/g, "")
    const servername = isIP(sniHost) === 0 ? url.hostname : undefined
    const requestOptions: RequestOptions = {
      protocol: url.protocol,
      hostname: address.address,
      family: address.family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers,
      signal,
      ...(url.protocol === "https:" && servername ? { servername } : {}),
    }
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      requestOptions,
      async (response) => {
        try {
          const body = await readBodyLimited(response, maxBodyBytes)
          resolve({
            status: response.statusCode ?? 0,
            location:
              typeof response.headers.location === "string"
                ? response.headers.location
                : undefined,
            body,
          })
        } catch (error) {
          reject(error)
        }
      }
    )
    request.once("error", reject)
    request.end()
  })
}

async function fetchWithGuards(
  startUrl: URL,
  options: VerifyWebOptions
): Promise<FetchOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    let current = startUrl

    for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
      const resolved = await (options.resolveUrl ?? resolvePublicHttpUrl)(
        current.toString()
      )
      const address = resolved.addresses[0]
      if (!address) throw new UnsafeUrlError("Hostname could not be resolved")

      // Connect to the exact address that passed validation. This removes the
      // validation/request DNS gap used by DNS rebinding attacks.
      const response = await (options.requestUrl ?? requestPinned)(
        resolved.url,
        address,
        controller.signal,
        options.maxBodyBytes
      )

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.location
        if (!location) {
          return {
            reachable: false,
            status: response.status,
            httpsValid: false,
            body: "",
            error: "Redirect response missing Location header",
          }
        }
        if (hop === options.maxRedirects) {
          return {
            reachable: false,
            status: response.status,
            httpsValid: false,
            body: "",
            error: `Exceeded max redirects (${options.maxRedirects})`,
          }
        }
        current = new URL(location, current)
        continue
      }

      const httpsValid =
        startUrl.protocol === "https:" && current.protocol === "https:"

      return {
        reachable: true,
        status: response.status,
        httpsValid,
        body: response.body,
        finalUrl: current.toString(),
      }
    }

    return {
      reachable: false,
      status: null,
      httpsValid: false,
      body: "",
      error: `Exceeded max redirects (${options.maxRedirects})`,
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return {
        reachable: false,
        status: null,
        httpsValid: false,
        body: "",
        error: error.message,
      }
    }

    const message = error instanceof Error ? error.message : String(error)
    const isTimeout =
      (error instanceof Error && error.name === "AbortError") ||
      /aborted|timeout/i.test(message)
    const isTls =
      /certificate|CERT_|SSL|TLS|unable to verify|UNABLE_TO_VERIFY/i.test(
        message
      )

    return {
      reachable: false,
      status: null,
      httpsValid: false,
      body: "",
      error: isTimeout
        ? `request timed out after ${options.timeoutMs}ms`
        : isTls
          ? `HTTPS/TLS validation failed: ${message}`
          : `request failed: ${message}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Independently verifies that a public website meets deployment expectations.
 * Preserves AgentVerify semantics while applying 404.directory SSRF guards.
 */
export async function verifyWeb(
  input: VerifyWebRequest,
  options: VerifyWebOptions
): Promise<VerifyWebResult> {
  const checkedAt = new Date().toISOString()

  let url: URL
  try {
    url = (await (options.resolveUrl ?? resolvePublicHttpUrl)(input.url)).url
  } catch (error) {
    const checks = {
      reachable: false,
      status: null,
      https_valid: false,
      text_found: false,
    }
    return {
      verified: false,
      checks,
      evidence: evidenceFor(input, checks),
      checked_at: checkedAt,
      error: error instanceof Error ? error.message : "invalid url",
    }
  }

  const outcome = await fetchWithGuards(url, options)
  const statusMatches =
    outcome.reachable && outcome.status === input.expected_status

  const expectedText = input.expected_text?.trim()
  const textFound =
    expectedText === undefined || expectedText === ""
      ? true
      : outcome.body.includes(expectedText)

  const httpsValid =
    url.protocol === "https:" ? outcome.reachable && outcome.httpsValid : false

  const verified =
    outcome.reachable &&
    statusMatches &&
    httpsValid &&
    textFound &&
    !outcome.error?.includes("exceeded")

  const result: VerifyWebResult = {
    verified,
    checks: {
      reachable: outcome.reachable,
      status: outcome.status,
      https_valid: httpsValid,
      text_found: textFound,
    },
    evidence: [],
    checked_at: checkedAt,
  }
  result.evidence = evidenceFor(input, result.checks)

  if (!verified) {
    if (outcome.error) {
      result.error = outcome.error
    } else if (!statusMatches) {
      result.error = `expected status ${input.expected_status}, got ${outcome.status}`
    } else if (!httpsValid) {
      result.error =
        url.protocol === "https:"
          ? "HTTPS certificate validation failed"
          : "url is not HTTPS"
    } else if (!textFound) {
      result.error = "expected_text was not found in the response body"
    }
  }

  return result
}
