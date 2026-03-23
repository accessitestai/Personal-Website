/**
 * Auto-post to LinkedIn and Twitter when a new blog post is published.
 *
 * This function runs automatically after every successful Netlify deploy.
 * It checks if there's a new blog post and shares it on social media.
 *
 * Required environment variables (set in Netlify Dashboard):
 *
 * Twitter/X:
 *   TWITTER_API_KEY          - Consumer API key
 *   TWITTER_API_SECRET       - Consumer API secret
 *   TWITTER_ACCESS_TOKEN     - Access token
 *   TWITTER_ACCESS_SECRET    - Access token secret
 *
 * LinkedIn:
 *   LINKEDIN_ACCESS_TOKEN    - OAuth 2.0 access token
 *   LINKEDIN_PERSON_URN      - Your LinkedIn person URN (e.g. urn:li:person:AbCdEf)
 */

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");

const SITE_URL = "https://akhileshmalani.com";

exports.handler = async function (event, context) {
  console.log("[AutoPost] Deploy succeeded — checking for new blog posts...");

  try {
    // 1. Fetch latest post info from the deployed site
    var latestPost;
    try {
      var res = await fetch(SITE_URL + "/_latest-post.json?v=" + Date.now());
      if (!res.ok) {
        console.log("[AutoPost] No _latest-post.json found (status " + res.status + ") — skipping.");
        return { statusCode: 200, body: "No latest post file found" };
      }
      latestPost = await res.json();
    } catch (fetchErr) {
      console.log("[AutoPost] Could not fetch latest post:", fetchErr.message);
      return { statusCode: 200, body: "Fetch error: " + fetchErr.message };
    }

    if (!latestPost || !latestPost.slug) {
      console.log("[AutoPost] No valid post data in _latest-post.json");
      return { statusCode: 200, body: "No valid post data" };
    }

    // 2. Check if this post was already shared (using Netlify Blobs for state)
    var lastSharedSlug = null;
    var store;
    try {
      store = getStore("social-sharing");
      lastSharedSlug = await store.get("last-shared-slug", { type: "text" });
    } catch (blobErr) {
      console.log("[AutoPost] Blobs read warning:", blobErr.message);
      // Continue anyway — we'll try to post
    }

    if (lastSharedSlug === latestPost.slug) {
      console.log("[AutoPost] Already shared: " + latestPost.slug);
      return { statusCode: 200, body: "Already shared: " + latestPost.slug };
    }

    console.log("[AutoPost] New post detected: \"" + latestPost.title + "\" (" + latestPost.slug + ")");

    var results = [];

    // 3. Post to Twitter/X
    var hasTwitter = process.env.TWITTER_API_KEY &&
                     process.env.TWITTER_API_SECRET &&
                     process.env.TWITTER_ACCESS_TOKEN &&
                     process.env.TWITTER_ACCESS_SECRET;

    if (hasTwitter) {
      try {
        await postToTwitter(latestPost);
        results.push("Twitter: posted");
        console.log("[AutoPost] Twitter — posted successfully");
      } catch (twErr) {
        results.push("Twitter: failed — " + twErr.message);
        console.error("[AutoPost] Twitter error:", twErr.message);
      }
    } else {
      console.log("[AutoPost] Twitter not configured — skipping");
      results.push("Twitter: not configured");
    }

    // 4. Post to LinkedIn
    var hasLinkedIn = process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_URN;

    if (hasLinkedIn) {
      try {
        await postToLinkedIn(latestPost);
        results.push("LinkedIn: posted");
        console.log("[AutoPost] LinkedIn — posted successfully");
      } catch (liErr) {
        results.push("LinkedIn: failed — " + liErr.message);
        console.error("[AutoPost] LinkedIn error:", liErr.message);
      }
    } else {
      console.log("[AutoPost] LinkedIn not configured — skipping");
      results.push("LinkedIn: not configured");
    }

    // 5. Save the slug so we don't double-post
    if (store) {
      try {
        await store.set("last-shared-slug", latestPost.slug);
        console.log("[AutoPost] Saved last shared slug: " + latestPost.slug);
      } catch (blobWriteErr) {
        console.log("[AutoPost] Blobs write warning:", blobWriteErr.message);
      }
    }

    console.log("[AutoPost] Done. Results: " + results.join(" | "));
    return { statusCode: 200, body: JSON.stringify({ post: latestPost.slug, results: results }) };

  } catch (err) {
    console.error("[AutoPost] Unexpected error:", err);
    return { statusCode: 500, body: "Error: " + err.message };
  }
};


// =====================================================
// Twitter/X — Post using OAuth 1.0a (API v2)
// =====================================================
async function postToTwitter(post) {
  var apiKey = process.env.TWITTER_API_KEY;
  var apiSecret = process.env.TWITTER_API_SECRET;
  var accessToken = process.env.TWITTER_ACCESS_TOKEN;
  var accessSecret = process.env.TWITTER_ACCESS_SECRET;

  var url = "https://api.twitter.com/2/tweets";

  var tweetText = "New blog post: " + post.title + "\n\n" +
    post.description + "\n\n" +
    post.url + "\n\n" +
    "#Accessibility #a11y #WebAccessibility #DigitalInclusion";

  // Truncate to 280 characters if needed
  if (tweetText.length > 280) {
    var urlPart = "\n\n" + post.url + "\n\n#Accessibility #a11y";
    var maxTitle = 280 - urlPart.length - 20;
    tweetText = post.title.substring(0, maxTitle) + "..." + urlPart;
  }

  var body = JSON.stringify({ text: tweetText });

  // --- OAuth 1.0a signature ---
  var oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0"
  };

  // Build signature base string (only OAuth params for POST with JSON body)
  var paramString = Object.keys(oauthParams)
    .sort()
    .map(function (k) { return encodeRFC3986(k) + "=" + encodeRFC3986(oauthParams[k]); })
    .join("&");

  var baseString = "POST&" + encodeRFC3986(url) + "&" + encodeRFC3986(paramString);
  var signingKey = encodeRFC3986(apiSecret) + "&" + encodeRFC3986(accessSecret);

  oauthParams.oauth_signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  // Build Authorization header
  var authHeader = "OAuth " + Object.keys(oauthParams)
    .sort()
    .map(function (k) { return encodeRFC3986(k) + '="' + encodeRFC3986(oauthParams[k]) + '"'; })
    .join(", ");

  var response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "User-Agent": "AkhileshMalani-AutoPost/1.0"
    },
    body: body
  });

  if (!response.ok) {
    var errText = await response.text();
    throw new Error(response.status + " " + errText);
  }

  return response.json();
}


// =====================================================
// LinkedIn — Post using REST API
// =====================================================
async function postToLinkedIn(post) {
  var accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  var personUrn = process.env.LINKEDIN_PERSON_URN;

  var text = "New Blog Post: " + post.title + "\n\n" +
    post.description + "\n\n" +
    "Read the full article: " + post.url + "\n\n" +
    "#Accessibility #DigitalInclusion #WebAccessibility #WCAG #a11y";

  var body = JSON.stringify({
    author: personUrn,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false
  });

  var response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + accessToken,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202401",
      "X-Restli-Protocol-Version": "2.0.0"
    },
    body: body
  });

  // LinkedIn returns 201 Created with empty body on success
  if (response.status === 201) {
    return { success: true };
  }

  if (!response.ok) {
    var errText = await response.text();
    throw new Error(response.status + " " + errText);
  }

  return { success: true };
}


// =====================================================
// RFC 3986 encoding (required for OAuth 1.0a)
// =====================================================
function encodeRFC3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
    return "%" + c.charCodeAt(0).toString(16).toUpperCase();
  });
}
