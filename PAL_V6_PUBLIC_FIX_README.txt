PAL V6 PUBLIC-ONLY UPDATE

1. Sign-in and registration header now show Home instead of a redundant Sign In link; Home leads to /.
2. Contact Us requires a confirmed Resend API message ID before showing success.
3. Contact Us response includes the Resend message ID; provider rejection details are logged server-side (without API keys).
4. Consultation forms, BAA and Newstart workspace files are unchanged.

IMPORTANT: A Resend message ID confirms provider acceptance, NOT final inbox delivery. If Contact Us still does not arrive, check Render logs for PAL public contact accepted by Resend / PAL public Resend rejection and check the matching message ID in Resend Emails for delivered, bounced, suppressed, or spam outcomes.
