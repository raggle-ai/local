# 📘 OAuth Authentication Guide

## 📌 Overview
This document explains the OAuth 2.0 authentication system implemented in Raggle API. OAuth 2.0 allows third-party applications to access user resources without sharing passwords. This guide covers how to authenticate users, obtain and refresh tokens, and integrate OAuth into applications.

## 🔧 Prerequisites
- A registered client application with a client ID and client secret
- Understanding of OAuth 2.0 authorization flows
- Access to a Raggle API instance

## 🔐 Supported OAuth 2.0 Flows

### 1. Authorization Code Flow
The most secure flow, suitable for web applications with a server-side component.

1. **Authorization Request**: Redirect users to the authorization endpoint
2. **User Consent**: User authenticates and approves the requested permissions
3. **Code Exchange**: Exchange the authorization code for access and refresh tokens
4. **Resource Access**: Use the access token to access protected resources

### 2. Client Credentials Flow
For server-to-server authentication where no user is involved.

### 3. API Key to OAuth 2.0 Flow
A custom flow that allows exchanging legacy API keys for OAuth 2.0 tokens.

## 🚀 Authentication Endpoints

### Authorization Endpoint
```
GET /api/v1/oauth/authorize
```

**Query Parameters:**
- `response_type`: Must be "code"
- `client_id`: Your application's client ID
- `redirect_uri`: URL to redirect after authorization (must be pre-registered)
- `scope`: Space-separated list of requested permissions
- `state`: Optional value for CSRF protection

**Example:**
```
https://api.example.com/api/v1/oauth/authorize?response_type=code&client_id=your_client_id&redirect_uri=https://your-app.com/callback&scope=profile email&state=random_state
```

### Token Endpoint
```
POST /api/v1/oauth/token
```

**Form Parameters for Authorization Code Grant:**
- `grant_type`: "authorization_code"
- `code`: The authorization code received from the authorization endpoint
- `redirect_uri`: Same redirect URI used in the authorization request
- `client_id`: Your application's client ID
- `client_secret`: Your application's client secret

**Form Parameters for Refresh Token Grant:**
- `grant_type`: "refresh_token"
- `refresh_token`: A previously issued refresh token
- `client_id`: Your application's client ID
- `client_secret`: Your application's client secret

**Form Parameters for Client Credentials Grant:**
- `grant_type`: "client_credentials"
- `client_id`: Your application's client ID
- `client_secret`: Your application's client secret
- `scope`: Optional space-separated list of scopes

**Form Parameters for API Key Grant:**
- `grant_type`: "api_key"
- `api_key`: A valid API key
- `client_id`: Your application's client ID
- `client_secret`: Your application's client secret
- `scope`: Optional space-separated list of scopes

**Response Example:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "scope": "profile email"
}
```

### Token Introspection Endpoint
```
POST /api/v1/oauth/introspect
```

**Form Parameters:**
- `token`: The token to introspect
- `token_type_hint`: Optional hint about the token type ("access_token" or "refresh_token")
- `client_id`: Optional client ID for additional validation
- `client_secret`: Optional client secret for additional validation

**Response Example for Active Token:**
```json
{
  "active": true,
  "scope": "profile email",
  "client_id": "client123",
  "token_type": "bearer",
  "exp": 1597957443,
  "sub": "user123",
  "iat": 1597953843,
  "username": "johndoe",
  "email": "john@example.com"
}
```

**Response Example for Inactive Token:**
```json
{
  "active": false
}
```

### Token Revocation Endpoint
```
POST /api/v1/oauth/revoke
```

**Form Parameters:**
- `token`: The token to revoke
- `token_type_hint`: Optional hint about the token type
- `client_id`: Optional client ID for additional validation
- `client_secret`: Optional client secret for additional validation

## 🛡️ Available Scopes
The API supports the following scopes:

- `profile`: Access to basic profile information
- `email`: Access to user email address
- `posts:read`: View user posts
- `posts:write`: Create and modify user posts
- `extracts:read`: View user extracts
- `extracts:write`: Create and modify user extracts

## 🔄 Authentication Flow Examples

### Authorization Code Flow

1. **Redirect user to the authorization endpoint:**
```javascript
const authUrl = 'https://api.example.com/api/v1/oauth/authorize' +
  '?response_type=code' +
  '&client_id=your_client_id' +
  '&redirect_uri=https://your-app.com/callback' +
  '&scope=profile email' +
  '&state=random_state';

window.location.href = authUrl;
```

2. **Handle the callback and exchange the code for tokens:**
```javascript
// On your callback URL (https://your-app.com/callback)
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');

// Verify state to prevent CSRF attacks
if (state !== 'random_state') {
  throw new Error('Invalid state parameter');
}

// Exchange code for tokens
const tokenResponse = await fetch('https://api.example.com/api/v1/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: 'https://your-app.com/callback',
    client_id: 'your_client_id',
    client_secret: 'your_client_secret',
  }),
});

const tokens = await tokenResponse.json();
// Store tokens securely
```

3. **Use the access token for API requests:**
```javascript
const apiResponse = await fetch('https://api.example.com/api/v1/protected-resource', {
  headers: {
    'Authorization': `Bearer ${tokens.access_token}`,
  },
});
```

4. **Refresh an expired token:**
```javascript
const refreshResponse = await fetch('https://api.example.com/api/v1/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: 'your_client_id',
    client_secret: 'your_client_secret',
  }),
});

const newTokens = await refreshResponse.json();
// Update stored tokens
```

## 👨‍💻 OAuth Client Management

OAuth clients must be registered by system administrators using the OAuth Clients API. These endpoints are only accessible to superusers.

### Register a New Client
```
POST /api/v1/oauth-clients/
```

**Request Body:**
```json
{
  "name": "Example Client",
  "client_id": "client123",
  "redirect_uris": ["https://example.com/callback"],
  "allowed_scopes": ["profile", "email"],
  "description": "Example OAuth client"
}
```

### Regenerate Client Secret
```
POST /api/v1/oauth-clients/{client_id}/regenerate-secret
```

## 🩹 Troubleshooting

- **Invalid Client Error**: Ensure your client ID and client secret are correct and the client is active.
- **Invalid Redirect URI**: The redirect URI must exactly match one of the pre-registered URIs for your client.
- **Invalid Scope**: Ensure the requested scopes are valid and allowed for your client.
- **Authorization Code Expired**: Authorization codes are valid for 10 minutes only. Request a new code if expired.
- **Invalid Token**: The token may be expired, revoked, or malformed. Try refreshing the token or re-authenticating.

## 🧠 Best Practices

1. **Always Use HTTPS**: OAuth 2.0 relies on HTTPS for security.
2. **Store Tokens Securely**: Never store tokens in localStorage or cookies without proper security measures.
3. **Validate State Parameter**: Always use and verify the state parameter to prevent CSRF attacks.
4. **Request Minimal Scopes**: Only request the scopes your application needs.
5. **Refresh Tokens Proactively**: Refresh access tokens before they expire to avoid service interruptions.
6. **Revoke Unused Tokens**: Always revoke tokens when they are no longer needed.

## 🗂️ References

- [OAuth 2.0 Specification (RFC 6749)](https://tools.ietf.org/html/rfc6749)
- [Token Introspection (RFC 7662)](https://tools.ietf.org/html/rfc7662)
- [Token Revocation (RFC 7009)](https://tools.ietf.org/html/rfc7009)

---

*Document updated on: 2024-05-26*
