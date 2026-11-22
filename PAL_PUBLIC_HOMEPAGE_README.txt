PAL PUBLIC HOMEPAGE RELEASE

Only changed server.js to register isolated /api/public/consultation endpoint and load public landing assets on the HOME view. Added public/pal-landing.js and public/pal-landing.css. No BAA/Newstart files or routes changed.

IMPORTANT: Before consultation emails work, set Render environment variable PAL_CONSULTATION_TO to the exact PAL Gmail recipient. The existing Gmail OAuth integration also needs to be connected/configured with GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, PAL_EMAIL_FROM, and encryption key, and a stored refresh token. No Gmail address was provided in this chat; we deliberately did not guess it. Form shows an honest error until configured.

All six popups, the homepage and form render without email setup. This is a stylized illustration slideshow (not real photography). Review copy for planned versus active services before publishing.
