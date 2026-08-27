"""404.directory prediction-market risk-preflight middleware."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import platform
import re
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal, Mapping, TypedDict, TypeVar

GuardMode = Literal["shadow", "warn", "enforce"]
Decision = Literal["allow", "review", "block"]
OutcomeAction = Literal[
    "proceeded",
    "reduced_position",
    "changed_side",
    "waited",
    "requested_review",
    "aborted",
]
FailureType = Literal[
    "resolution_rules",
    "liquidity",
    "execution",
    "data_quality",
    "compliance",
    "signal",
    "other",
]

SAFE_SOURCE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
AGENT_ID = re.compile(
    r"^agent:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


class PredictionMarketPreflightRequest(TypedDict, total=False):
    market: str
    intended_action: Literal[
        "observe", "buy_yes", "buy_no", "sell_yes", "sell_no"
    ]
    estimated_notional_usd: float
    execution_mode: Literal["supervised", "unattended"]
    geographic_eligibility: Literal["eligible", "blocked", "unknown"]


class Directory404Error(RuntimeError):
    """A bounded, recoverable SDK or 404.directory request error."""

    def __init__(
        self,
        message: str,
        code: Literal[
            "invalid_configuration",
            "invalid_response",
            "request_failed",
            "timeout",
        ],
        status: int | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.retryable = retryable


Transport = Callable[
    [str, Mapping[str, str], Mapping[str, Any], float], tuple[int, Any]
]
T = TypeVar("T")


def _default_data_directory() -> Path:
    configured = os.environ.get("DIRECTORY_404_DATA_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    system = platform.system().lower()
    if system == "windows":
        return Path(
            os.environ.get("LOCALAPPDATA")
            or os.environ.get("APPDATA")
            or Path.home()
        ) / "404-directory"
    if system == "darwin":
        return Path.home() / "Library" / "Application Support" / "404-directory"
    return Path(
        os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")
    ) / "404-directory"


def load_or_create_agent_id(
    agent_name: str = "default", data_directory: str | Path | None = None
) -> str:
    """Return one stable random identity without sending ``agent_name``."""

    root = Path(data_directory) if data_directory else _default_data_directory()
    agent_key = hashlib.sha256(
        (agent_name.strip().lower() or "default").encode("utf-8")
    ).hexdigest()[:24]
    identity_directory = root / "risk-sdk" / agent_key
    identity_directory.mkdir(parents=True, exist_ok=True)
    identity_path = identity_directory / "agent-id"

    try:
        existing = identity_path.read_text(encoding="utf-8").strip()
        if AGENT_ID.fullmatch(existing):
            return existing
        raise Directory404Error(
            f"Refusing to overwrite invalid 404.directory Agent identity: {identity_path}",
            "invalid_configuration",
        )
    except FileNotFoundError:
        pass

    agent_id = f"agent:{uuid.uuid4()}"
    try:
        descriptor = os.open(identity_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as identity_file:
            identity_file.write(f"{agent_id}\n")
        return agent_id
    except FileExistsError:
        existing = identity_path.read_text(encoding="utf-8").strip()
        if AGENT_ID.fullmatch(existing):
            return existing
        raise Directory404Error(
            f"Refusing to use invalid 404.directory Agent identity: {identity_path}",
            "invalid_configuration",
        ) from None


def _default_transport(
    url: str,
    headers: Mapping[str, str],
    body: Mapping[str, Any],
    timeout: float,
) -> tuple[int, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=dict(headers),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = response.status
            raw_body = response.read()
    except urllib.error.HTTPError as error:
        status = error.code
        raw_body = error.read()
    except TimeoutError as error:
        raise Directory404Error(
            "404.directory preflight timed out", "timeout", retryable=True
        ) from error
    except urllib.error.URLError as error:
        timeout_error = isinstance(error.reason, TimeoutError)
        raise Directory404Error(
            "404.directory preflight timed out"
            if timeout_error
            else "404.directory preflight request failed",
            "timeout" if timeout_error else "request_failed",
            retryable=True,
        ) from error

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise Directory404Error(
            f"404.directory returned non-JSON HTTP {status}",
            "invalid_response",
            status=status,
            retryable=status >= 500,
        ) from error
    return status, payload


def _validate_evaluation(payload: Mapping[str, Any]) -> dict[str, Any]:
    decision = payload.get("decision")
    valid = (
        isinstance(payload.get("receipt_id"), str)
        and isinstance(payload.get("outcome_token"), str)
        and len(payload["outcome_token"]) >= 32
        and payload.get("platform") == "polymarket"
        and isinstance(payload.get("policy_version"), str)
        and decision in ("allow", "review", "block")
        and isinstance(payload.get("risk_score"), (int, float))
        and isinstance(payload.get("confidence"), (int, float))
        and isinstance(payload.get("reason_codes"), list)
        and isinstance(payload.get("risk_factors"), list)
        and isinstance(payload.get("unknowns"), list)
        and isinstance(payload.get("next_action"), str)
    )
    if not valid:
        raise Directory404Error(
            "404.directory returned an incomplete prediction-market evaluation",
            "invalid_response",
        )
    return dict(payload)


def _validate_outcome_report(payload: Mapping[str, Any]) -> dict[str, Any]:
    if not (
        isinstance(payload.get("receipt_id"), str)
        and payload.get("status") in ("recorded", "already_reported")
        and payload.get("evidence_level") == "self_reported"
    ):
        raise Directory404Error(
            "404.directory returned an invalid outcome report",
            "invalid_response",
        )
    return dict(payload)


class Directory404Client:
    """Synchronous preflight client for trading and research Agents."""

    def __init__(
        self,
        *,
        source: str,
        agent_id: str,
        base_url: str = "https://404.directory",
        timeout_seconds: float = 8.0,
        transport: Transport | None = None,
    ) -> None:
        if not SAFE_SOURCE.fullmatch(source):
            raise Directory404Error(
                "source must be a lowercase non-personal label using a-z, 0-9, dot, underscore, or hyphen",
                "invalid_configuration",
            )
        if not AGENT_ID.fullmatch(agent_id):
            raise Directory404Error(
                "agent_id must be a random UUID v4 prefixed with 'agent:'; never use an email, user name, or device name",
                "invalid_configuration",
            )
        self.source = source
        self.agent_id = agent_id
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self._transport = transport or _default_transport

    @classmethod
    def create(
        cls,
        *,
        source: str,
        agent_id: str | None = None,
        agent_name: str | None = None,
        data_directory: str | Path | None = None,
        base_url: str = "https://404.directory",
        timeout_seconds: float = 8.0,
        transport: Transport | None = None,
    ) -> Directory404Client:
        return cls(
            source=source,
            agent_id=agent_id
            or load_or_create_agent_id(agent_name or source, data_directory),
            base_url=base_url,
            timeout_seconds=timeout_seconds,
            transport=transport,
        )

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-404-Agent-ID": self.agent_id,
            "X-404-Source": self.source,
            "X-404-Client-Name": "agent-risk-sdk-python",
        }

    def _post(self, path_name: str, body: Mapping[str, Any]) -> dict[str, Any]:
        try:
            status, payload = self._transport(
                f"{self.base_url}{path_name}",
                self._headers,
                body,
                self.timeout_seconds,
            )
        except Directory404Error:
            raise
        except Exception as error:
            raise Directory404Error(
                "404.directory preflight request failed",
                "request_failed",
                retryable=True,
            ) from error
        if not isinstance(payload, dict):
            raise Directory404Error(
                "404.directory returned an invalid response object",
                "invalid_response",
                status=status,
                retryable=status >= 500,
            )
        if status < 200 or status >= 300:
            message = payload.get("message") or payload.get("error")
            raise Directory404Error(
                str(message or "Unknown 404.directory error"),
                "request_failed",
                status=status,
                retryable=status in (408, 429) or status >= 500,
            )
        return payload

    def preflight_prediction_market(
        self, request: PredictionMarketPreflightRequest
    ) -> dict[str, Any]:
        return _validate_evaluation(
            self._post("/v1/prediction-markets/evaluations", request)
        )

    def report_prediction_market_outcome(
        self,
        evaluation: Mapping[str, Any],
        *,
        action_taken: OutcomeAction,
        execution_result: Literal[
            "executed", "not_executed", "failed", "unknown"
        ],
        failure_type: FailureType | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "outcome_token": evaluation["outcome_token"],
            "action_taken": action_taken,
            "execution_result": execution_result,
        }
        if failure_type is not None:
            body["failure_type"] = failure_type
        return _validate_outcome_report(
            self._post(
                f"/v1/prediction-markets/evaluations/{evaluation['receipt_id']}/outcome",
                body,
            )
        )

    def guard_prediction_market_action(
        self,
        request: PredictionMarketPreflightRequest,
        execute: Callable[[], T],
        *,
        mode: GuardMode = "shadow",
        on_review: Callable[[Mapping[str, Any]], bool] | None = None,
        outcome_action: OutcomeAction = "proceeded",
        failure_type: FailureType = "execution",
    ) -> dict[str, Any]:
        if mode not in ("shadow", "warn", "enforce"):
            raise Directory404Error(
                "mode must be shadow, warn, or enforce",
                "invalid_configuration",
            )
        try:
            evaluation = self.preflight_prediction_market(request)
        except Directory404Error as preflight_error:
            if mode != "shadow":
                return {
                    "mode": mode,
                    "evaluation": None,
                    "executed": False,
                    "blocked_by_policy": True,
                    "preflight_error": preflight_error,
                }
            try:
                return {
                    "mode": mode,
                    "evaluation": None,
                    "executed": True,
                    "blocked_by_policy": False,
                    "result": execute(),
                    "preflight_error": preflight_error,
                }
            except Exception as execution_error:  # noqa: BLE001
                return {
                    "mode": mode,
                    "evaluation": None,
                    "executed": True,
                    "blocked_by_policy": False,
                    "execution_error": execution_error,
                    "preflight_error": preflight_error,
                }

        decision = evaluation.get("decision")
        should_execute = mode == "shadow" or decision == "allow"
        if mode == "warn" and decision == "review" and on_review:
            should_execute = bool(on_review(evaluation))

        result: dict[str, Any] = {
            "mode": mode,
            "evaluation": evaluation,
            "executed": should_execute,
            "blocked_by_policy": not should_execute,
        }
        if not should_execute:
            action_taken: OutcomeAction = (
                "requested_review" if decision == "review" else "aborted"
            )
            try:
                result["report"] = self.report_prediction_market_outcome(
                    evaluation,
                    action_taken=action_taken,
                    execution_result="not_executed",
                )
            except Directory404Error as report_error:
                result["report_error"] = report_error
            return result

        try:
            result["result"] = execute()
            try:
                result["report"] = self.report_prediction_market_outcome(
                    evaluation,
                    action_taken=outcome_action,
                    execution_result="executed",
                )
            except Directory404Error as report_error:
                result["report_error"] = report_error
        except Exception as execution_error:  # noqa: BLE001
            result["execution_error"] = execution_error
            try:
                result["report"] = self.report_prediction_market_outcome(
                    evaluation,
                    action_taken=outcome_action,
                    execution_result="failed",
                    failure_type=failure_type,
                )
            except Directory404Error as report_error:
                result["report_error"] = report_error
        return result


class AsyncDirectory404Client:
    """Async wrapper that keeps the dependency-free HTTP implementation."""

    def __init__(self, client: Directory404Client) -> None:
        self.client = client

    @classmethod
    def create(cls, **options: Any) -> AsyncDirectory404Client:
        return cls(Directory404Client.create(**options))

    async def preflight_prediction_market(
        self, request: PredictionMarketPreflightRequest
    ) -> dict[str, Any]:
        return await asyncio.to_thread(self.client.preflight_prediction_market, request)

    async def report_prediction_market_outcome(
        self, evaluation: Mapping[str, Any], **outcome: Any
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self.client.report_prediction_market_outcome, evaluation, **outcome
        )

    async def guard_prediction_market_action(
        self,
        request: PredictionMarketPreflightRequest,
        execute: Callable[[], Awaitable[T]],
        *,
        mode: GuardMode = "shadow",
        on_review: Callable[[Mapping[str, Any]], bool | Awaitable[bool]] | None = None,
        outcome_action: OutcomeAction = "proceeded",
        failure_type: FailureType = "execution",
    ) -> dict[str, Any]:
        try:
            evaluation = await self.preflight_prediction_market(request)
        except Directory404Error as preflight_error:
            if mode != "shadow":
                return {
                    "mode": mode,
                    "evaluation": None,
                    "executed": False,
                    "blocked_by_policy": True,
                    "preflight_error": preflight_error,
                }
            try:
                return {
                    "mode": mode,
                    "evaluation": None,
                    "executed": True,
                    "blocked_by_policy": False,
                    "result": await execute(),
                    "preflight_error": preflight_error,
                }
            except Exception as execution_error:  # noqa: BLE001
                return {
                    "mode": mode,
                    "evaluation": None,
                    "executed": True,
                    "blocked_by_policy": False,
                    "execution_error": execution_error,
                    "preflight_error": preflight_error,
                }

        decision = evaluation.get("decision")
        should_execute = mode == "shadow" or decision == "allow"
        if mode == "warn" and decision == "review" and on_review:
            review_result = on_review(evaluation)
            should_execute = bool(
                await review_result
                if isinstance(review_result, Awaitable)
                else review_result
            )

        result: dict[str, Any] = {
            "mode": mode,
            "evaluation": evaluation,
            "executed": should_execute,
            "blocked_by_policy": not should_execute,
        }
        if not should_execute:
            action_taken: OutcomeAction = (
                "requested_review" if decision == "review" else "aborted"
            )
            try:
                result["report"] = await self.report_prediction_market_outcome(
                    evaluation,
                    action_taken=action_taken,
                    execution_result="not_executed",
                )
            except Directory404Error as report_error:
                result["report_error"] = report_error
            return result

        try:
            result["result"] = await execute()
            try:
                result["report"] = await self.report_prediction_market_outcome(
                    evaluation,
                    action_taken=outcome_action,
                    execution_result="executed",
                )
            except Directory404Error as report_error:
                result["report_error"] = report_error
        except Exception as execution_error:  # noqa: BLE001
            result["execution_error"] = execution_error
            try:
                result["report"] = await self.report_prediction_market_outcome(
                    evaluation,
                    action_taken=outcome_action,
                    execution_result="failed",
                    failure_type=failure_type,
                )
            except Directory404Error as report_error:
                result["report_error"] = report_error
        return result


__all__ = [
    "AsyncDirectory404Client",
    "Directory404Client",
    "Directory404Error",
    "PredictionMarketPreflightRequest",
    "load_or_create_agent_id",
]
