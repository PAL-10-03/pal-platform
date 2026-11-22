# PAL Public Email — Setup and Testing

This release is based on PAL_Public_Homepage_V3_Email_Forms.zip and changes only public homepage/email integration files.

## Render environment
- RESEND_API_KEY: the secret API key already configured in Render. Do not add it to code or GitHub.
- PAL_PUBLIC_EMAIL_FROM: optional; defaults to `PAL Business Solutions <admin@palbiz.app>`. This sending address must be on the verified Resend domain.
- Both forms send to `admin@palbiz.app` as configured in public-mail.js. Ensure this mailbox exists and can receive email; Resend domain sending verification alone does not create a receiving inbox. If you want a different destination, change the destination constant in public-mail.js before deploying.

## Release
1. Back up your currently deployed full ZIP separately before uploading this release. Keep your Supabase Storage backups separate (code ZIP does not back up storage).
2. Upload the complete ZIP to the PAL GitHub repo, preserving the folder structure. Deploy on Render.
3. Check the homepage: Sign In remains unchanged; Contact Us appears immediately to its right.
4. Send a test consultation, then a test Contact Us message with a small PDF attachment. Confirm receipt at the destination mailbox and verify the success message appears only on API acceptance.
5. Test failed sending (temporarily use a nonfunctional key in a safe test environment) and verify the error state, then restore the valid key.

Resend's accepted response confirms provider acceptance, not guaranteed final inbox delivery. Inspect Resend email logs and spam filters if messages do not arrive.
