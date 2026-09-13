'use strict';

/**
 * Kaito — Reddit image source, with a credential-free fallback.
 *
 * Two paths, same output shape, so callers don't care which one ran:
 *
 *   1. Authenticated (preferred). Reddit's app-only OAuth "client credentials"
 *      flow. Requires REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET. Raw
 *      `www.reddit.com/…json` is deliberately NOT used: it returns 403 from
 *      cloud host IPs (and did from this machine during setup).
 *   2. Proxy fallback. meme-api.com needs no credentials and returns posts
 *      already narrowed to images. Best-effort: it 400s on subreddits where it
 *      finds nothing, so callers should try another subreddit.
 *
 * Note on Reddit credentials (2026): self-service API access has reportedly
 * closed — new OAuth apps need approval — so most installs will run on the
 * fallback. See SETUP.md step 6.
 */

const { fetchJson, HttpError } = require('../lib/http');
const config = require('../lib/config');
const logger = require('../lib/logger');

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const OAUTH_BASE = 'https://oauth.reddit.com';
const PROXY_BASE = 'https://meme-api.com/gimme';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

/** Cached app-only token: { value, expiresAt }. Refreshed when it expires. */
let cachedToken = null;

/** Set when Reddit rate-limits us, so we stop hammering it for a while. */
let rateLimitedUntil = 0;

function hasCredentials() {
  return config.reddit.enabled;
}

/** Exchange client ID + secret for an app-only bearer token, with caching. */
async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const basic = Buffer.from(`${config.reddit.clientId}:${config.reddit.clientSecret}`).toString('base64');
  const data = await fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.reddit.userAgent,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });

  if (!data.access_token) throw new Error('Reddit returned no access_token');

  // Refresh a minute early rather than racing the expiry.
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 60) * 1000,
  };
  logger.debug('Reddit app-only token refreshed');
  return cachedToken.value;
}

/**
 * Pull the image URL out of a Reddit post, or null if it isn't a usable image.
 * Handles three shapes: a direct image link, a gallery, and a post Reddit has
 * generated a preview image for.
 */
function imageUrlFor(post) {
  const direct = post.url_overridden_by_dest || post.url || '';
  const withoutQuery = direct.split('?')[0].toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => withoutQuery.endsWith(ext))) return direct;

  if (post.is_gallery && post.media_metadata) {
    const first = Object.values(post.media_metadata).find((item) => item?.s?.u || item?.s?.gif);
    if (first) return first.s.u || first.s.gif;
  }

  return post.preview?.images?.[0]?.source?.url ?? null;
}

/**
 * Keep only posts that are a real, displayable, safe image.
 * `raw_json=1` on the request means these URLs aren't HTML-escaped.
 */
function toImagePost(post) {
  if (post.over_18 || post.spoiler || post.stickied || post.pinned) return null;
  if (post.removed_by_category || post.is_video) return null;

  const imageUrl = imageUrlFor(post);
  if (!imageUrl) return null;

  return {
    title: post.title ?? 'Untitled',
    imageUrl,
    postUrl: `https://reddit.com${post.permalink}`,
    subreddit: post.subreddit,
    author: post.author,
    ups: post.ups ?? 0,
    source: 'reddit',
  };
}

/** Authenticated listing fetch. Throws HttpError (401/429/…) for the caller. */
async function fetchViaOAuth(subreddit, { listing, limit }) {
  const token = await getToken();
  const url = `${OAUTH_BASE}/r/${encodeURIComponent(subreddit)}/${listing}?limit=${limit}&raw_json=1`;

  const data = await fetchJson(url, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': config.reddit.userAgent },
  });

  return (data?.data?.children ?? []).map((child) => child.data);
}

/** Credential-free fallback. Returns posts in the same shape as toImagePost. */
async function fetchViaProxy(subreddit, count) {
  const data = await fetchJson(`${PROXY_BASE}/${encodeURIComponent(subreddit)}/${count}`);
  const memes = data.memes ?? (data.url ? [data] : []);

  return memes
    .filter((meme) => !meme.nsfw && !meme.spoiler && meme.url)
    .filter((meme) => IMAGE_EXTENSIONS.some((ext) => meme.url.split('?')[0].toLowerCase().endsWith(ext)))
    .map((meme) => ({
      title: meme.title ?? 'Untitled',
      imageUrl: meme.url,
      postUrl: meme.postLink,
      subreddit: meme.subreddit ?? subreddit,
      author: meme.author,
      ups: meme.ups ?? 0,
      source: 'proxy',
    }));
}

/**
 * Every usable image post from a subreddit, via whichever path is available.
 * Returns [] rather than throwing when a source simply has nothing to offer,
 * so callers can move on to the next subreddit.
 *
 * @param {string} subreddit
 * @param {{ listing?: 'hot'|'top'|'new', limit?: number }} [options]
 */
async function fetchImagePosts(subreddit, { listing = 'hot', limit = 50 } = {}) {
  if (hasCredentials() && Date.now() >= rateLimitedUntil) {
    try {
      const raw = await fetchViaOAuth(subreddit, { listing, limit });
      const posts = raw.map(toImagePost).filter(Boolean);
      if (posts.length > 0) return posts;
      logger.debug(`Reddit: r/${subreddit} had no usable images`);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        cachedToken = null; // token rejected — drop it so the next call re-auths
      } else if (error instanceof HttpError && error.status === 429) {
        // Back off instead of retrying into the limit; the proxy covers us.
        rateLimitedUntil = Date.now() + 10 * 60_000;
        logger.warn('Reddit rate-limited us (429) — falling back to the proxy for 10 minutes');
      }
      logger.warn(`Reddit fetch failed for r/${subreddit}: ${error.message}`);
    }
  }

  try {
    return await fetchViaProxy(subreddit, Math.min(limit, 50));
  } catch (error) {
    // The proxy 400s on subreddits where it finds no images — expected, not a bug.
    logger.debug(`Proxy fetch failed for r/${subreddit}: ${error.message}`);
    return [];
  }
}

module.exports = { fetchImagePosts, hasCredentials };
