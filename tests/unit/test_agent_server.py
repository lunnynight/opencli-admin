"""Unit tests for backend/agent_server.py fleet-auth header attachment (ADR-0005).

Covers `_auth_headers()`, the Authorization header on `_register_with_center`'s
httpx POST calls, and the `additional_headers` -> `extra_headers` fallback in
`_register_via_ws`'s connect call.
"""

import asyncio

import pytest

from backend import agent_server


# ── _auth_headers ────────────────────────────────────────────────────────────


def test_auth_headers_empty_when_no_token(monkeypatch):
    monkeypatch.setattr(agent_server, "_AGENT_API_TOKEN", "")
    assert agent_server._auth_headers() == {}


def test_auth_headers_bearer_when_token_set(monkeypatch):
    monkeypatch.setattr(agent_server, "_AGENT_API_TOKEN", "x")
    assert agent_server._auth_headers() == {"Authorization": "Bearer x"}


# ── _register_with_center attaches Authorization header ────────────────────


class _FakeResponse:
    def raise_for_status(self) -> None:
        return None


class _FakeAsyncClient:
    """Minimal stand-in for httpx.AsyncClient capturing post() calls."""

    last_post_kwargs: dict = {}
    last_post_args: tuple = ()

    def __init__(self, **kwargs) -> None:
        self._kwargs = kwargs

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *exc) -> None:
        return None

    async def post(self, url, **kwargs):
        _FakeAsyncClient.last_post_args = (url,)
        _FakeAsyncClient.last_post_kwargs = kwargs
        return _FakeResponse()


@pytest.mark.asyncio
async def test_register_with_center_attaches_authorization_header(monkeypatch):
    monkeypatch.setattr(agent_server, "_AGENT_API_TOKEN", "secret-token")
    monkeypatch.setattr(agent_server, "_CENTRAL_API_URL", "http://center.example")

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)

    await agent_server._register_with_center("http://agent.example:19823")

    assert _FakeAsyncClient.last_post_kwargs.get("headers") == {
        "Authorization": "Bearer secret-token"
    }
    assert _FakeAsyncClient.last_post_args == ("http://center.example/api/v1/nodes/register",)


@pytest.mark.asyncio
async def test_register_with_center_sends_empty_headers_without_token(monkeypatch):
    monkeypatch.setattr(agent_server, "_AGENT_API_TOKEN", "")
    monkeypatch.setattr(agent_server, "_CENTRAL_API_URL", "http://center.example")

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)

    await agent_server._register_with_center("http://agent.example:19823")

    assert _FakeAsyncClient.last_post_kwargs.get("headers") == {}


# ── _register_via_ws: additional_headers -> extra_headers fallback ─────────


class _FakeWsConnection:
    async def __aenter__(self):
        raise _StopTest("connected")

    async def __aexit__(self, *exc):
        return False


class _StopTest(BaseException):
    """Raised once the fake connect() context manager is entered, to short-
    circuit the reconnect loop after asserting the connect kwargs used.

    Deliberately subclasses BaseException (not Exception): _register_via_ws's
    reconnect loop catches `except Exception` and retries forever, which
    would swallow this and hang the test instead of stopping it.
    """


class _FakeWebsocketsModule:
    """Fake `websockets` module recording connect() kwargs and simulating the
    additional_headers TypeError path for older websockets versions."""

    def __init__(self, raise_on_additional_headers: bool) -> None:
        self.raise_on_additional_headers = raise_on_additional_headers
        self.calls: list[dict] = []

    def connect(self, uri, **kwargs):
        self.calls.append(kwargs)
        if self.raise_on_additional_headers and "additional_headers" in kwargs:
            raise TypeError("connect() got an unexpected keyword argument 'additional_headers'")
        return _FakeWsConnection()


@pytest.mark.asyncio
async def test_register_via_ws_uses_additional_headers_when_supported(monkeypatch):
    fake_ws = _FakeWebsocketsModule(raise_on_additional_headers=False)
    monkeypatch.setitem(__import__("sys").modules, "websockets", fake_ws)
    monkeypatch.setattr(agent_server, "_AGENT_API_TOKEN", "secret-token")
    monkeypatch.setattr(agent_server, "_CENTRAL_API_URL", "http://center.example")

    with pytest.raises(_StopTest):
        await agent_server._register_via_ws("http://agent.example:19823")

    assert len(fake_ws.calls) == 1
    assert fake_ws.calls[0]["additional_headers"] == {"Authorization": "Bearer secret-token"}


@pytest.mark.asyncio
async def test_register_via_ws_falls_back_to_extra_headers_on_typeerror(monkeypatch):
    fake_ws = _FakeWebsocketsModule(raise_on_additional_headers=True)
    monkeypatch.setitem(__import__("sys").modules, "websockets", fake_ws)
    monkeypatch.setattr(agent_server, "_AGENT_API_TOKEN", "secret-token")
    monkeypatch.setattr(agent_server, "_CENTRAL_API_URL", "http://center.example")

    with pytest.raises(_StopTest):
        await agent_server._register_via_ws("http://agent.example:19823")

    # First call attempted additional_headers and raised TypeError; second
    # (successful) call used extra_headers instead.
    assert len(fake_ws.calls) == 2
    assert "additional_headers" in fake_ws.calls[0]
    assert fake_ws.calls[1]["extra_headers"] == {"Authorization": "Bearer secret-token"}


@pytest.mark.asyncio
async def test_register_via_ws_no_headers_kwarg_without_token(monkeypatch):
    fake_ws = _FakeWebsocketsModule(raise_on_additional_headers=False)
    monkeypatch.setitem(__import__("sys").modules, "websockets", fake_ws)
    monkeypatch.setattr(agent_server, "_AGENT_API_TOKEN", "")
    monkeypatch.setattr(agent_server, "_CENTRAL_API_URL", "http://center.example")

    with pytest.raises(_StopTest):
        await agent_server._register_via_ws("http://agent.example:19823")

    assert len(fake_ws.calls) == 1
    assert "additional_headers" not in fake_ws.calls[0]
    assert "extra_headers" not in fake_ws.calls[0]
