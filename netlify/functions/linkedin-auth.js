/**
 * LinkedIn OAuth 2.0 — Step 1: Redirect user to LinkedIn for authorization.
 *
 * Visit: https://akhileshmalani.com/.netlify/functions/linkedin-auth
 *
 * Required env vars:
 *   LINKEDIN_CLIENT_ID     - From your LinkedIn App
 *   LINKEDIN_CLIENT_SECRET - From your LinkedIn App
 */

var SITE_URL = "https://akhileshmalani.com";

exports.handler = async function (event, context) {
  var clientId = process.env.LINKEDIN_CLIENT_ID;

  if (!clientId) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: '<html><body style="font-family:sans-serif;max-width:600px;margin:2rem auto;padding:1rem;">' +
        '<h1>LinkedIn Setup Required</h1>' +
        '<p>Set <code>LINKEDIN_CLIENT_ID</code> and <code>LINKEDIN_CLIENT_SECRET</code> in your Netlify environment variables first.</p>' +
        '<p><a href="https://www.linkedin.com/developers/apps">Create a LinkedIn App here</a></p>' +
        '</body></html>'
    };
  }

  var redirectUri = SITE_URL + "/.netlify/functions/linkedin-callback";
  var scope = "openid profile w_member_social";
  var state = require("crypto").randomBytes(16).toString("hex");

  var authUrl = "https://www.linkedin.com/oauth/v2/authorization" +
    "?response_type=code" +
    "&client_id=" + encodeURIComponent(clientId) +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&scope=" + encodeURIComponent(scope) +
    "&state=" + state;

  return {
    statusCode: 302,
    headers: { Location: authUrl }
  };
};
