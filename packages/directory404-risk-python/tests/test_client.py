import asyncio
import hashlib
import tempfile
import unittest
from pathlib import Path

from directory404_risk import (
    AsyncDirectory404Client,
    Directory404Client,
    Directory404Error,
    load_or_create_agent_id,
)


class FakeTransport:
    def __init__(self, decision="allow", unavailable=False, malformed=False):
        self.decision = decision
        self.unavailable = unavailable
        self.malformed = malformed
        self.calls = []

    def __call__(self, url, headers, body, timeout):
        self.calls.append((url, headers, body, timeout))
        if self.unavailable:
            raise Directory404Error(
                "unavailable", "request_failed", retryable=True
            )
        if self.malformed:
            return 200, {"decision": "allow"}
        if url.endswith("/outcome"):
            return 200, {
                "receipt_id": "00000000-0000-4000-8000-000000000001",
                "status": "recorded",
                "evidence_level": "self_reported",
            }
        return 201, {
            "receipt_id": "00000000-0000-4000-8000-000000000001",
            "outcome_token": "x" * 43,
            "platform": "polymarket",
            "policy_version": "polymarket-preflight-v1",
            "decision": self.decision,
            "risk_score": 0,
            "confidence": 0.9,
            "reason_codes": [],
            "risk_factors": [],
            "unknowns": [],
            "next_action": "test",
        }


REQUEST = {
    "market": "example-market",
    "intended_action": "buy_yes",
    "estimated_notional_usd": 100,
    "geographic_eligibility": "eligible",
}


class Directory404ClientTest(unittest.TestCase):
    def client(self, transport):
        return Directory404Client.create(
            source="python-pilot",
            agent_id="agent:00000000-0000-4000-8000-000000000001",
            transport=transport,
        )

    def test_identity_is_stable_per_agent_name(self):
        with tempfile.TemporaryDirectory() as directory:
            first = load_or_create_agent_id("strategy-a", directory)
            second = load_or_create_agent_id("strategy-a", directory)
            other = load_or_create_agent_id("strategy-b", directory)
            self.assertEqual(first, second)
            self.assertNotEqual(first, other)
            agent_key = hashlib.sha256(b"strategy-a").hexdigest()[:24]
            stored = (
                Path(directory) / "risk-sdk" / agent_key / "agent-id"
            ).read_text(encoding="utf-8")
            self.assertEqual(stored.strip(), first)

    def test_shadow_executes_block_and_reports(self):
        transport = FakeTransport("block")
        result = self.client(transport).guard_prediction_market_action(
            REQUEST, lambda: "order-result", mode="shadow"
        )
        self.assertTrue(result["executed"])
        self.assertEqual(result["result"], "order-result")
        self.assertEqual(result["report"]["status"], "recorded")
        self.assertEqual(len(transport.calls), 2)
        self.assertEqual(
            transport.calls[0][1]["X-404-Agent-ID"],
            "agent:00000000-0000-4000-8000-000000000001",
        )
        self.assertEqual(
            transport.calls[0][1]["X-404-Client-Name"],
            "agent-risk-sdk-python",
        )

    def test_warn_stops_block(self):
        calls = []
        result = self.client(FakeTransport("block")).guard_prediction_market_action(
            REQUEST, lambda: calls.append("executed"), mode="warn"
        )
        self.assertFalse(result["executed"])
        self.assertTrue(result["blocked_by_policy"])
        self.assertEqual(calls, [])

    def test_warn_review_requires_approval(self):
        result = self.client(FakeTransport("review")).guard_prediction_market_action(
            REQUEST,
            lambda: "approved",
            mode="warn",
            on_review=lambda _evaluation: True,
        )
        self.assertTrue(result["executed"])
        self.assertEqual(result["result"], "approved")

    def test_enforce_fails_closed_when_preflight_is_unavailable(self):
        calls = []
        result = self.client(
            FakeTransport(unavailable=True)
        ).guard_prediction_market_action(
            REQUEST, lambda: calls.append("executed"), mode="enforce"
        )
        self.assertFalse(result["executed"])
        self.assertEqual(calls, [])
        self.assertEqual(result["preflight_error"].code, "request_failed")

    def test_enforce_fails_closed_on_malformed_success_response(self):
        calls = []
        result = self.client(
            FakeTransport(malformed=True)
        ).guard_prediction_market_action(
            REQUEST, lambda: calls.append("executed"), mode="enforce"
        )
        self.assertFalse(result["executed"])
        self.assertEqual(calls, [])
        self.assertEqual(result["preflight_error"].code, "invalid_response")

    def test_async_client_executes_and_reports(self):
        async def scenario():
            client = AsyncDirectory404Client(self.client(FakeTransport("allow")))

            async def execute():
                return "async-order"

            return await client.guard_prediction_market_action(
                REQUEST, execute, mode="enforce"
            )

        result = asyncio.run(scenario())
        self.assertTrue(result["executed"])
        self.assertEqual(result["result"], "async-order")
        self.assertEqual(result["report"]["status"], "recorded")


if __name__ == "__main__":
    unittest.main()
