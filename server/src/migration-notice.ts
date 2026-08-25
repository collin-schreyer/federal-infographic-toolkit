// Sunset notice for the retired Fly.io deployment.
//
// Enabled only when MIGRATED_NOTICE=1 is set in the environment, so the same
// image runs unchanged on AWS (where the variable is absent) and on Fly (where
// it is set). Turning it off is one command: `fly secrets unset MIGRATED_NOTICE`.
//
// MIGRATION_URL is optional. When unset, the page tells people to contact
// Collin rather than publishing the new address on a public page.

export const migrationNoticeEnabled = () => process.env.MIGRATED_NOTICE === '1';

export function migrationNoticeHtml(): string {
  const newUrl = process.env.MIGRATION_URL || '';
  const contact = process.env.MIGRATION_CONTACT || 'Collin Schreyer (schreyerc@bna-inc.com)';

  const ctaBlock = newUrl
    ? `<a class="cta" href="${newUrl}">Go to the new toolkit &rarr;</a>
       <p class="fine">New address: <code>${newUrl}</code></p>`
    : `<p class="contact">Reach out to <strong>${contact}</strong> for the new link.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Federal Infographic Toolkit has moved</title>
<style>
  *{ box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    background: #fafafa; color: #18181b; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  .card {
    max-width: 560px; width: 100%; background: #fff; border: 1px solid #e4e4e7;
    border-radius: 16px; padding: 40px; box-shadow: 0 12px 40px rgba(0,0,0,.06);
  }
  .badge {
    display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: .12em;
    text-transform: uppercase; color: #a16207; background: #fef9c3;
    border: 1px solid #fde68a; padding: 5px 10px; border-radius: 999px; margin-bottom: 20px;
  }
  h1 { font-size: 25px; line-height: 1.25; margin: 0 0 14px; letter-spacing: -.02em; }
  p { font-size: 15px; line-height: 1.65; color: #3f3f46; margin: 0 0 14px; }
  .good {
    background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px;
    padding: 14px 16px; margin: 22px 0;
  }
  .good p { margin: 0; color: #065f46; font-size: 14px; }
  .cta {
    display: inline-block; margin-top: 8px; background: #09090b; color: #fff;
    text-decoration: none; font-weight: 700; font-size: 14px;
    padding: 13px 22px; border-radius: 10px;
  }
  .cta:hover { background: #27272a; }
  .contact {
    margin-top: 8px; padding: 14px 16px; background: #fafafa;
    border: 1px solid #e4e4e7; border-radius: 10px; font-size: 14px;
  }
  .fine { font-size: 12px; color: #71717a; margin-top: 14px; }
  code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  .foot {
    margin-top: 28px; padding-top: 18px; border-top: 1px solid #f4f4f5;
    font-size: 12px; color: #a1a1aa;
  }
</style>
</head>
<body>
  <main class="card">
    <span class="badge">This service has moved</span>
    <h1>The Federal Infographic Toolkit now runs on AWS</h1>

    <p>
      We've migrated the toolkit to a new home on AWS, along with a <strong>2.0 release</strong>
      that adds shared projects, an image history you can revise from, richer layout and
      typography options, and faster rendering.
    </p>

    <div class="good">
      <p>
        <strong>Your account came with us.</strong> Every user, saved image, and project
        transferred over &mdash; and your existing email and password work exactly as before.
        Nothing to reset.
      </p>
    </div>

    <p>We'd love to see you over there.</p>

    ${ctaBlock}

    <p class="foot">
      This address is no longer maintained and will be shut down.
      Questions? Contact ${contact}.
    </p>
  </main>
</body>
</html>`;
}
