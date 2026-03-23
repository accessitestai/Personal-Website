/**
 * LinkedIn OAuth 2.0 — Step 2: Handle callback, exchange code for token.
 *
 * After authorizing on LinkedIn, the user lands here.
 * This function displays the access token and person URN
 * for the user to copy into Netlify environment variables.
 *
 * Required env vars:
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 */

var SITE_URL = "https://akhileshmalani.com";

exports.handler = async function (event, context) {
  var params = event.queryStringParameters || {};
  var code = params.code;
  var error = params.error;
  var errorDesc = params.error_description;

  if (error) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: errorPage("Authorization Denied", errorDesc || error)
    };
  }

  if (!code) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: errorPage("Missing Code", "No authorization code received from LinkedIn.")
    };
  }

  var clientId = process.env.LINKEDIN_CLIENT_ID;
  var clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  var redirectUri = SITE_URL + "/.netlify/functions/linkedin-callback";

  // --- Exchange authorization code for access token ---
  var tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code: code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  });

  var tokenRes;
  try {
    tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString()
    });
  } catch (fetchErr) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: errorPage("Token Exchange Failed", "Network error: " + fetchErr.message)
    };
  }

  var tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: errorPage("Token Exchange Failed", JSON.stringify(tokenData))
    };
  }

  // --- Get user profile to find the person URN ---
  var personUrn = "unknown";
  try {
    var profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { "Authorization": "Bearer " + tokenData.access_token }
    });
    var profile = await profileRes.json();
    if (profile.sub) {
      personUrn = "urn:li:person:" + profile.sub;
    }
  } catch (profileErr) {
    console.error("Profile fetch error:", profileErr.message);
  }

  var expiresInDays = Math.round((tokenData.expires_in || 0) / 86400);

  // --- Display the credentials for the user to copy ---
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: successPage(tokenData.access_token, personUrn, expiresInDays, tokenData.refresh_token)
  };
};


function successPage(accessToken, personUrn, expiresInDays, refreshToken) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>LinkedIn Authorization Successful</title>' +
    '<style>' +
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 700px; margin: 0 auto; padding: 2rem 1rem; line-height: 1.6; color: #2c3e50; }' +
    'h1 { color: #27ae60; }' +
    'h2 { color: #1a5276; margin-top: 2rem; }' +
    '.token-box { width: 100%; padding: 0.75rem; font-family: monospace; font-size: 0.85rem; border: 2px solid #1a5276; border-radius: 6px; background: #f8f9fa; word-break: break-all; }' +
    '.steps { background: #e8f6e8; padding: 1.5rem; border-radius: 8px; margin-top: 2rem; }' +
    '.steps ol { padding-left: 1.5rem; }' +
    '.steps li { margin-bottom: 0.75rem; }' +
    '.warning { background: #fff3cd; padding: 1rem; border-radius: 6px; border-left: 4px solid #f39c12; margin-top: 1rem; }' +
    'a:focus { outline: 3px solid #1a5276; outline-offset: 2px; }' +
    '</style></head><body>' +
    '<h1>LinkedIn Authorization Successful!</h1>' +
    '<p>Copy these values to your <strong>Netlify Environment Variables</strong>.</p>' +
    '<h2>1. LINKEDIN_ACCESS_TOKEN</h2>' +
    '<textarea class="token-box" rows="4" readonly aria-label="LinkedIn access token">' + accessToken + '</textarea>' +
    '<h2>2. LINKEDIN_PERSON_URN</h2>' +
    '<textarea class="token-box" rows="1" readonly aria-label="LinkedIn person URN">' + personUrn + '</textarea>' +
    (refreshToken ? '<h2>3. LINKEDIN_REFRESH_TOKEN (optional)</h2><textarea class="token-box" rows="3" readonly aria-label="LinkedIn refresh token">' + refreshToken + '</textarea>' : '') +
    '<div class="warning">' +
    '<strong>Token expires in ' + expiresInDays + ' days.</strong> ' +
    'When it expires, visit <a href="/.netlify/functions/linkedin-auth">the authorization page</a> again to get a new token.' +
    '</div>' +
    '<div class="steps">' +
    '<h2 style="margin-top:0">How to save these:</h2>' +
    '<ol>' +
    '<li>Go to <a href="https://app.netlify.com" target="_blank">app.netlify.com</a></li>' +
    '<li>Select your site</li>' +
    '<li>Go to <strong>Site configuration</strong> then <strong>Environment variables</strong></li>' +
    '<li>Add each variable name and its value</li>' +
    '<li>Click <strong>Save</strong></li>' +
    '</ol>' +
    '</div>' +
    '<p style="margin-top:2rem"><a href="/">Back to website</a></p>' +
    '</body></html>';
}


function errorPage(title, detail) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>LinkedIn Authorization Error</title>' +
    '<style>body { font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem; } h1 { color: #c0392b; } .detail { background: #f8d7da; padding: 1rem; border-radius: 6px; }</style>' +
    '</head><body>' +
    '<h1>' + title + '</h1>' +
    '<div class="detail"><p>' + detail + '</p></div>' +
    '<p style="margin-top:2rem"><a href="/.netlify/functions/linkedin-auth">Try again</a> | <a href="/">Back to website</a></p>' +
    '</body></html>';
}
