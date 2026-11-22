PAL Public Homepage V2
Source: user-provided PAL_Public_Homepage_V1(1).zip
Changes: public/pal-landing.js, public/pal-landing.css, public/pal-auth-theme.css (new), server.js (public-only email recipient fallback and sign-in stylesheet).
No BAA/Newstart files, routes, or tenant logic edited.
Consultation recipient defaults to admin@palbiz.app. IMPORTANT: Gmail delivery requires existing Gmail OAuth integration to be configured on Render (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, PAL_EMAIL_FROM, encryption key and connected refresh token). Without that, form reports delivery failure rather than claiming success.
