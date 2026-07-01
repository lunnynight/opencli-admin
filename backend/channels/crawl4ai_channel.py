"""Crawl4AI channel: JS-rendered pages + built-in anti-detection.

CSS-structured extraction only (JsonCssExtractionStrategy) — no
LLMExtractionStrategy. AI enrichment is the pipeline's own downstream AI step
(backend.pipeline.pipeline's collect -> normalize/store -> AI -> notify), not
a channel's job; a thin channel only fetches + structurally parses.

Deliberately does NOT go through backend.browser_pool / connect_over_cdp like
every other browser-touching channel (skill/opencli channels attach to an
already-running, human-logged-in browser via session_affinity). Crawl4AI's
whole reason for existing here is its own anti-detection browser management
(enable_stealth, magic mode); forcing it onto an externally-attached browser
would throw that away and leave nothing but a slower Playwright.
"""

import json
import logging
from typing import Any
from urllib.parse import urlparse

from backend.channels.base import (
    AbstractChannel,
    ChannelFetchError,
    ChannelResult,
    FetchContext,
    FetchResult,
)
from backend.channels.registry import register_channel

logger = logging.getLogger(__name__)


@register_channel
class Crawl4AIChannel(AbstractChannel):
    """Collect data from JS-rendered pages via Crawl4AI's own managed browser."""

    channel_type = "crawl4ai"

    async def collect(
        self, config: dict[str, Any], parameters: dict[str, Any]
    ) -> ChannelResult:
        """Thin wrapper around fetch() — see api_channel.collect() for the
        pattern this mirrors."""
        ctx = FetchContext(config=config, params=parameters)
        try:
            result = await self.fetch(ctx)
        except ChannelFetchError as exc:
            cause = exc.__cause__
            return ChannelResult.fail(str(exc), error_type=type(cause).__name__ if cause else None)
        return ChannelResult.ok(result.items, **result.metadata)

    async def fetch(self, ctx: FetchContext) -> FetchResult:
        config = ctx.config
        url: str = config.get("url", "")
        if not url:
            raise ChannelFetchError("crawl4ai channel: 'url' is required")
        list_selector: str = config.get("list_selector", "")
        selectors: dict[str, str] = config.get("selectors", {})
        wait_for: str | None = config.get("wait_for")
        auth_config: dict = config.get("auth", {})

        cookies: list[dict] = []
        if auth_config.get("type") == "cookie":
            cookies = await self._resolve_cookies(url)

        try:
            from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
            from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
        except ImportError as exc:
            raise ChannelFetchError("crawl4ai package not installed") from exc

        schema = {
            "baseSelector": list_selector or "body",
            "fields": [{"name": name, "selector": sel, "type": "text"} for name, sel in selectors.items()],
        }
        extraction_strategy = JsonCssExtractionStrategy(schema)

        browser_config = BrowserConfig(headless=True, enable_stealth=True, cookies=cookies or None)
        run_config = CrawlerRunConfig(
            extraction_strategy=extraction_strategy,
            cache_mode=CacheMode.BYPASS,
            magic=True,
            wait_for=wait_for,
        )

        try:
            async with AsyncWebCrawler(config=browser_config) as crawler:
                result = await crawler.arun(url=url, config=run_config)
        except ChannelFetchError:
            raise
        except Exception as exc:
            raise ChannelFetchError(f"crawl4ai request to {url} failed: {exc}") from exc

        if not result.success:
            raise ChannelFetchError(f"crawl4ai fetch failed: {result.error_message or 'unknown error'}")

        items: list[dict[str, Any]] = []
        if result.extracted_content:
            try:
                parsed = json.loads(result.extracted_content)
            except (json.JSONDecodeError, TypeError) as exc:
                raise ChannelFetchError("crawl4ai: could not parse extracted_content as JSON") from exc
            items = parsed if isinstance(parsed, list) else [parsed]

        return FetchResult(items=items, metadata={"url": url, "status_code": result.status_code})

    @staticmethod
    async def _resolve_cookies(url: str) -> list[dict]:
        """auth.type == "cookie": borrow a real login session synced from
        CookieCloud. AuthManager.resolve_cookies() already returns
        Playwright-shaped dicts, which is exactly what BrowserConfig.cookies
        expects (Crawl4AI's browser layer is Playwright)."""
        from backend.auth.manager import AuthManager

        domain = urlparse(url).hostname or ""
        if not domain:
            return []
        return await AuthManager().resolve_cookies(domain)

    async def validate_config(self, config: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if not config.get("url"):
            errors.append("'url' is required for crawl4ai channel")
        if not config.get("selectors"):
            errors.append("'selectors' is required for crawl4ai channel")
        return errors

    async def health_check(
        self, config: dict[str, Any] | None = None, source_id: str | None = None
    ) -> bool:
        """Two-tier: the crawl4ai package (this channel's "driver") must be
        importable at all, then, when a source's config is available, a real
        lightweight fetch of the target URL. Short timeout: liveness, not a
        full crawl."""
        try:
            from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
        except Exception as exc:
            logger.warning("crawl4ai health_check: package unavailable: %s", exc)
            return False

        if config is None:
            return True  # no source context to probe (e.g. called standalone)
        url: str = config.get("url", "")
        if not url:
            return False

        try:
            async with AsyncWebCrawler(config=BrowserConfig(headless=True)) as crawler:
                result = await crawler.arun(
                    url=url, config=CrawlerRunConfig(cache_mode=CacheMode.BYPASS, page_timeout=5000)
                )
            return bool(result.success)
        except Exception as exc:
            logger.warning("crawl4ai health_check: %s unreachable: %s", url, exc)
            return False
