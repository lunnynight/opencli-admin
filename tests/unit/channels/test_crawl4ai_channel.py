"""Unit tests for the Crawl4AI channel — mocks crawl4ai.AsyncWebCrawler (the
package's browser lifecycle is intentionally NOT under this repo's
browser_pool, per ADR: Crawl4AI manages its own anti-detection browser)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.channels.base import ChannelFetchError, FetchContext
from backend.channels.crawl4ai_channel import Crawl4AIChannel


@pytest.fixture
def channel():
    return Crawl4AIChannel()


def _make_crawler_ctx(result):
    crawler = AsyncMock()
    crawler.arun = AsyncMock(return_value=result)
    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=crawler)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx, crawler


def _make_result(success=True, extracted_content=None, error_message=None, status_code=200):
    result = MagicMock()
    result.success = success
    result.extracted_content = extracted_content
    result.error_message = error_message
    result.status_code = status_code
    return result


# ── validate_config ──────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_validate_config_missing_url(channel):
    errors = await channel.validate_config({"selectors": {"title": "h1"}})
    assert "'url' is required for crawl4ai channel" in errors


@pytest.mark.asyncio
async def test_validate_config_missing_selectors(channel):
    errors = await channel.validate_config({"url": "https://example.com"})
    assert "'selectors' is required for crawl4ai channel" in errors


@pytest.mark.asyncio
async def test_validate_config_valid(channel):
    errors = await channel.validate_config({"url": "https://example.com", "selectors": {"title": "h1"}})
    assert errors == []


# ── fetch() ──────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_fetch_success_parses_extracted_items(channel):
    import json

    result = _make_result(extracted_content=json.dumps([{"title": "Alpha"}, {"title": "Beta"}]))
    ctx_mgr, crawler = _make_crawler_ctx(result)

    ctx = FetchContext(
        config={"url": "https://example.com", "list_selector": ".item", "selectors": {"title": "h2"}},
        params={},
    )
    with patch("crawl4ai.AsyncWebCrawler", return_value=ctx_mgr):
        fetch_result = await channel.fetch(ctx)

    assert fetch_result.items == [{"title": "Alpha"}, {"title": "Beta"}]
    assert fetch_result.metadata == {"url": "https://example.com", "status_code": 200}
    crawler.arun.assert_awaited_once()


@pytest.mark.asyncio
async def test_fetch_no_url_raises(channel):
    ctx = FetchContext(config={"selectors": {"title": "h1"}}, params={})
    with pytest.raises(ChannelFetchError, match="'url' is required"):
        await channel.fetch(ctx)


@pytest.mark.asyncio
async def test_fetch_crawl_failure_raises_with_error_message(channel):
    result = _make_result(success=False, error_message="blocked by anti-bot")
    ctx_mgr, _crawler = _make_crawler_ctx(result)

    ctx = FetchContext(config={"url": "https://example.com", "selectors": {"title": "h1"}}, params={})
    with patch("crawl4ai.AsyncWebCrawler", return_value=ctx_mgr):
        with pytest.raises(ChannelFetchError, match="blocked by anti-bot"):
            await channel.fetch(ctx)


@pytest.mark.asyncio
async def test_fetch_malformed_extracted_content_raises(channel):
    result = _make_result(extracted_content="not-json{{{")
    ctx_mgr, _crawler = _make_crawler_ctx(result)

    ctx = FetchContext(config={"url": "https://example.com", "selectors": {"title": "h1"}}, params={})
    with patch("crawl4ai.AsyncWebCrawler", return_value=ctx_mgr):
        with pytest.raises(ChannelFetchError, match="could not parse extracted_content"):
            await channel.fetch(ctx)


@pytest.mark.asyncio
async def test_fetch_cookie_auth_passes_resolved_cookies_to_browser_config(channel):
    import json

    result = _make_result(extracted_content=json.dumps([{"title": "Alpha"}]))
    ctx_mgr, _crawler = _make_crawler_ctx(result)

    ctx = FetchContext(
        config={
            "url": "https://example.com/page",
            "selectors": {"title": "h1"},
            "auth": {"type": "cookie"},
        },
        params={},
    )
    fake_cookies = [{"name": "session_id", "domain": "example.com", "value": "abc"}]
    with patch("crawl4ai.AsyncWebCrawler", return_value=ctx_mgr) as crawler_ctor, patch(
        "backend.auth.manager.AuthManager.resolve_cookies", AsyncMock(return_value=fake_cookies)
    ) as resolve_cookies, patch("crawl4ai.BrowserConfig") as browser_config_ctor:
        await channel.fetch(ctx)

    resolve_cookies.assert_awaited_once_with("example.com")
    assert browser_config_ctor.call_args.kwargs["cookies"] == fake_cookies
    crawler_ctor.assert_called_once()


# ── health_check ─────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_health_check_no_config_returns_true(channel):
    assert await channel.health_check(None) is True


@pytest.mark.asyncio
async def test_health_check_no_url_returns_false(channel):
    assert await channel.health_check({}) is False


@pytest.mark.asyncio
async def test_health_check_package_unavailable_returns_false(channel):
    with patch.dict("sys.modules", {"crawl4ai": None}):
        assert await channel.health_check({"url": "https://example.com"}) is False


@pytest.mark.asyncio
async def test_health_check_success(channel):
    result = _make_result(success=True)
    ctx_mgr, _crawler = _make_crawler_ctx(result)
    with patch("crawl4ai.AsyncWebCrawler", return_value=ctx_mgr):
        assert await channel.health_check({"url": "https://example.com"}) is True


@pytest.mark.asyncio
async def test_health_check_crawl_exception_returns_false(channel):
    ctx_mgr = AsyncMock()
    ctx_mgr.__aenter__ = AsyncMock(side_effect=RuntimeError("browser launch failed"))
    with patch("crawl4ai.AsyncWebCrawler", return_value=ctx_mgr):
        assert await channel.health_check({"url": "https://example.com"}) is False


# ── registry ─────────────────────────────────────────────────────────────────
def test_crawl4ai_registered():
    from backend.channels.registry import list_channel_types

    assert "crawl4ai" in list_channel_types()
