PAL PUBLIC HOMEPAGE V3 - EMAIL DELIVERY SETUP

Both public forms send to: admin@palbiz.app
This version uses Resend's HTTPS email API for PUBLIC SITE FORMS ONLY.
It does not use or modify the existing BAA/Newstart Gmail OAuth automation.

REQUIRED ONE-TIME SETUP (emails will fail until completed):
1. Create a Resend account at https://resend.com and verify the sending domain palbiz.app.
2. Add the DNS records that Resend specifically provides for palbiz.app in your DNS provider. Do not replace Clerk DNS records.
3. Create an API key in Resend.
4. In Render > your PAL web service > Environment, add:
   PAL_PUBLIC_RESEND_API_KEY = <your Resend API key>
   PAL_PUBLIC_EMAIL_FROM = PAL Business Solutions <notifications@palbiz.app>
   (The FROM address must be on the verified domain. Resend may require a different exact format/address.)
5. Save and redeploy. Do not place the API key in GitHub, ZIP, or browser code.
6. Test both public forms from palbiz.app and check admin@palbiz.app, including spam.
7. If a form fails, check Render logs for 'PAL public consultation email failed' or 'PAL public contact email failed'.

The application returns success only after the email provider returns a message ID.
A provider acceptance does not guarantee final inbox delivery (spam filters and bounces can still occur).

Contact Us supports one PDF, PNG, JPEG, TXT, CSV, DOC, DOCX, XLS or XLSX attachment up to 5 MB.
Consultation retains its business/contact/preference fields and does not accept attachments.
No tenant databases, authentication, or internal business routes were intentionally changed.
