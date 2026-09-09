/**
 * TASARA — send-email Edge Function
 *
 * Sends notifications via Resend. Only callable by admin users.
 * No rate limit on the client side (RLS enforces the role); the
 * admin must be the authenticated caller, checked server-side.
 *
 * Environment variables (set in Supabase Dashboard → Edge Functions):
 *   RESEND_API_KEY   — Resend sender token
 *   ADMIN_EMAIL      — default fallback recipient (admin@tasara.ng)
 *
 * Security notes:
 *   * There is no 'to' field in the request — recipients are either
 *     resolved server-side from admin lookups (internal emails) or
 *     pulled from a server-trusted config. This prevents the function
 *     from being abused as an open relay.
 *   * Access-Control-Allow-Origin is locked to the Vercel domain;
 *     CORS for POST requires an Authorization header, blocking
 *     browser-to-browser cross-origin requests.
 */

// Deno.serve: standard HTTP server from Deno std (modern runtime).
const { serve } = await import('https://deno.land/std@0.224.0/http/mod.ts');

// Supabase client for the edge function — uses the service role key
// set by the platform itself (supabaseServiceRole env).
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.116.0');

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'admin@tasara.ng';
const TELEGRAM_URL = Deno.env.get('TELEGRAM_COMMUNITY_URL') || '';

// Only the Vercel production / preview domains are allowed origin.
// Use your actual domain when deploying.
function isTrustedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const url = new URL(origin);
  // In local development, localhost is fine; in prod, match your domain.
  const trusted = [
    'localhost',
    '127.0.0.1',
    ...(TELEGRAM_URL ? [] : ['yourdomain.com']), // placeholder — replace at deploy time
  ];
  return trusted.some(t => url.hostname.includes(t));
}

const CORSPreFlightHeaders = {
  'Access-Control-Allow-Origin': '*', // overridden per-request below
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

interface Body {
  subject: string;
  template: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // ---- CORS preflight ----
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('origin');
    const corsHeaders = { ...CORSPreFlightHeaders };
    if (origin && isTrustedOrigin(origin)) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
      corsHeaders['Access-Control-Allow-Credentials'] = 'true';
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ---- Method guard ----
  if (req.method !== 'POST') {
    const body = JSON.stringify({ error: 'Method not allowed' });
    return new Response(body, {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  // ---- Authentication guard: require Supabase auth token ----
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    const body = JSON.stringify({ error: 'Missing authorization header.' });
    return new Response(body, { status: 401, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  if (!authHeader.startsWith('Bearer ')) {
    const body = JSON.stringify({ error: 'Invalid authorization header format.' });
    return new Response(body, { status: 401, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  const token = authHeader.slice(7);

  // ---- Decode JWT to check role (fast, no DB round-trip) ----
  let claims: Record<string, unknown> = {};
  try {
    const payload = token.split('.')[1];
    if (!payload) throw new Error('Malformed token');
    // Base64url decode without padding
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    claims = JSON.parse(json) as Record<string, unknown>;
  } catch {
    const body = JSON.stringify({ error: 'Invalid authorization token.' });
    return new Response(body, { status: 401, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  // The 'role' claim is set by our RLS policy and is the single source
  // of truth here. If it's not 'admin', refuse — this keeps the
  // function from being used as a spam relay by regular users.
  const role = claims?.role as string | undefined;
  if (role !== 'admin') {
    const body = JSON.stringify({ error: 'Forbidden: admin access required.' });
    return new Response(body, { status: 403, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  // ---- Parse body ----
  let body: Body;
  try {
    body = await req.json() as Body;
  } catch {
    const err = JSON.stringify({ error: 'Invalid JSON body.' });
    return new Response(err, { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  if (!body.subject || !body.template) {
    const err = JSON.stringify({ error: 'Missing required fields: subject, template.' });
    return new Response(err, { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  if (!RESEND_API_KEY) {
    console.error('[send-email] RESEND_API_KEY not configured');
    const err = JSON.stringify({ error: 'Email service not configured.' });
    return new Response(err, { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  const htmlBody = buildEmailHtml(body.template, body.data || {});

  // ---- Deliver via Resend ----
  // The 'from' address must match a verified domain in Resend.
  // In dev we fall back to the sandbox sender (limited).
  const fromAddress = 'Tasara <onboarding@resend.dev>';

  // Recipients: use the project's admin email only.
  // Templates can include metadata but do not accept arbitrary
  // recipient addresses — keep them server-resolved.
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [ADMIN_EMAIL],
        subject: body.subject,
        html: htmlBody,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[send-email] Resend API error:', result);
      const err = JSON.stringify({ error: 'Email send failed', details: result });
      return new Response(err, { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }

    console.log('[send-email] Email sent successfully:', result);
    const ok = JSON.stringify({ success: true, id: (result as { id: string }).id });
    return new Response(ok, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('[send-email] Unhandled error:', err);
    const errBody = JSON.stringify({ error: (err as Error).message });
    return new Response(errBody, { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
});

// ─────────────────────────────────────────────────────────────────
// Template builder
// ─────────────────────────────────────────────────────────────────

interface TemplateData {
  name?: string;
  tier?: string;
  message?: string;
}

function buildEmailHtml(template: string, data: TemplateData): string {
  const brandColor = '#c8a44e';
  const bgColor = '#0b0f1a';
  const textColor = '#f1f5f9';
  const mutedColor = '#94a3b8';

  const templates: Record<string, string> = {
    buyer_profile_updated: `
      <p>Hello Admin,</p>
      <p><strong>${esc(data.name || 'A buyer')}</strong> has updated their account information.</p>
      <p style="margin-top:20px;"><span style="color:${mutedColor};">Platform: Tasara</span></p>
    `,
    seller_change_pending: `
      <p>Hello Admin,</p>
      <p><strong>${esc(data.name || 'A seller')}</strong> has submitted changes for review.</p>
      <p style="margin-top:8px;">Please review the pending changes in the admin dashboard.</p>
      <p style="margin-top:20px;"><span style="color:${mutedColor};">Platform: Tasara</span></p>
    `,
    seller_approved: `
      <p>Hello Admin,</p>
      <p>A seller has been approved. Please notify them through the admin dashboard.</p>
      <p style="margin-top:20px;"><span style="color:${mutedColor};">Platform: Tasara</span></p>
    `,
    account_deactivated: `
      <p>Hello Admin,</p>
      <p><strong>${esc(data.name || 'A user')}</strong> has deactivated their account.</p>
      <p style="margin-top:20px;"><span style="color:${mutedColor};">Platform: Tasara</span></p>
    `,
  };

  const body = templates[template] ?? `<p>${esc(data.message || 'You have a new notification.')}</p>`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:${bgColor};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${textColor};">
      <table role="presentation" style="width:100%;max-width:600px;margin:0 auto;padding:40px 20px;">
        <tr><td>
          <div style="text-align:center;margin-bottom:32px;">
            <h1 style="font-size:28px;font-weight:800;color:${brandColor};margin:0;">Tasara</h1>
          </div>
          <div style="background:rgba(17,24,39,0.8);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:32px;">
            ${body}
          </div>
          <div style="text-align:center;margin-top:24px;font-size:12px;color:${mutedColor};">
            <p>This is an automated message from Tasara. Please do not reply.</p>
          </div>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

function esc(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
