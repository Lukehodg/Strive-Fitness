# Gmail and Outlook setup

Strive supports both providers through the native Connect → Open email screen. No mailbox is connected merely by adding credentials. The user signs in, grants access, chooses messages to import and explicitly confirms each outgoing email.

## Shared requirements

- Run database migrations, including `0007_noisy_exodus.sql`.
- Configure an owner-controlled reachable HTTPS `PUBLIC_API_URL` (origin only).
- Preserve `INTEGRATION_ENCRYPTION_KEY` (64 hexadecimal characters). Changing it without migrating stored credentials makes existing connections unreadable.
- Put provider client secrets only in the server environment. Never add them to `EXPO_PUBLIC_*`, source control or chat.
- Install a native development build with the existing `strivefitness` URL scheme and point it at the HTTPS API.

## Gmail

Create a Google Cloud project, enable Gmail API, configure an OAuth consent screen and a Web application OAuth client. Add test users while testing.

- Environment: `MAIL_GMAIL_CLIENT_ID`, `MAIL_GMAIL_CLIENT_SECRET`
- Authorized redirect: `https://YOUR-API-HOST/api/mail/gmail/callback`
- Requested scopes: `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.send`
- The authorization uses offline access, consent and PKCE S256. Gmail read access is a restricted scope; public distribution requires Google's applicable verification and security assessment process. Testing-mode refresh tokens can expire; do not treat a successful local test as production approval.

Official setup: https://developers.google.com/identity/protocols/oauth2/web-server
Scope requirements: https://developers.google.com/workspace/gmail/api/auth/scopes

## Outlook / Microsoft 365

Register a Microsoft Entra app that supports the intended organizational and personal Microsoft accounts. Configure a Web redirect and create a client secret. Use delegated permissions, not application-wide mailbox permissions.

- Environment: `MAIL_OUTLOOK_CLIENT_ID`, `MAIL_OUTLOOK_CLIENT_SECRET`
- Redirect: `https://YOUR-API-HOST/api/mail/outlook/callback`
- Scopes: `offline_access User.Read Mail.Read Mail.Send`
- Authorization uses the common v2 endpoint and PKCE S256. Organizational policies may require an administrator's consent.

Official flow: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
Sending semantics: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0

## Behaviour and limits

- Browse only the latest 15 inbox messages on request. Message bodies are fetched only when the user selects Import for review.
- Imported content is bounded plain text (20,000 characters), displayed as data, and can be kept as a note or dismissed. No attachments are imported. HTML-only Gmail messages may be represented by a snippet. Imported emails never automatically alter nutrition, training, medication or reminders.
- An account has at most one Gmail and one Outlook mailbox. Import identities include mailbox address so switching mailboxes does not mix message IDs.
- OAuth callbacks are state-bound and one-time. Completion requires the authenticated account and an app-held claim secret. Codes, PKCE verifiers and provider tokens are encrypted at rest with account/provider associated data.
- A database lease serializes mailbox operations and refresh rotation. Updated refresh tokens are stored before reading or sending.
- Sending supports one recipient, subject and plain-text body. Confirmation is required. Each request is recorded before the provider call; retries reuse the request key. Accepted means the provider accepted the message, not that it was delivered.
- A timeout or crash after dispatch has an unknown outcome. Strive does not automatically resend. Check the provider's Sent mail before composing another message. The application cannot provide exactly-once delivery across a provider without an idempotent send API.
- Disconnect removes Strive's stored credentials and pending authorizations; imported notes and sending history remain. Revoke the app's grant in Google/Microsoft account settings for full provider-side revocation.
- Account deletion/export, automatic imports, recurring outbound reminders, attachments and background notifications remain outstanding.

## Verification status

Both provider protocols are tested using injected HTTP fixtures: PKCE/state/claim ownership, encrypted credentials, selected imports, review ownership, send confirmation, header-injection rejection, retry deduplication, uncertain delivery and refresh rotation persistence. No live Gmail or Outlook account has been authorized or used, and no real email was sent during development. Native callback behaviour still needs an installed-device test.
