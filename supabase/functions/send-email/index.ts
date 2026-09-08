import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Resend API key — set as environment variable in Supabase Edge Functions dashboard
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'admin@tasara.ng';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }

  const { to, subject, template, data } = body;

  if (!RESEND_API_KEY) {
    console.error('[send-email] RESEND_API_KEY not configured');
    return new Response(
      JSON.stringify({ error: 'Email service not configured. Set RESEND_API_KEY in Edge Functions secrets.' }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }

  if (!to || !subject) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: to, subject' }),
      { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }

  const htmlBody = buildEmailHtml(template, data || {});

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Tasara <onboarding@resend.dev>',
        to: [to],
        subject,
        html: htmlBody,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[send-email] Resend API error:', result);
      return new Response(
        JSON.stringify({ error: 'Email send failed', details: result }),
        { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    console.log('[send-email] Email sent successfully:', result);
    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  } catch (err) {
    console.error('[send-email] Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }
});

function buildEmailHtml(template, data) {
  const brandColor = '#c8a44e';
  const bgColor = '#0b0f1a';
  const textColor = '#f1f5f9';
  const mutedColor = '#94a3b8';

  const templates = {
    'buyer_profile_updated': `
      <p>Hello Admin,</p>
      <p><strong>${esc(data.name || 'A buyer')}</strong> has updated their account information.</p>
      <p style="margin-top:20px;"><span style="color:${mutedColor};">Platform: Tasara</span></p>
    `,
    'seller_change_pending': `
      <p>Hello Admin,</p>
      <p><strong>${esc(data.name || 'A seller')}</strong> has submitted changes for review.</p>
      <p style="margin-top:8px;">Please review the pending changes in the admin dashboard.</p>
      <p style="margin-top:20px;"><span style="color:${mutedColor};">Platform: Tasara</span></p>
    `,
    'new_seller_registration': `
      <p>Hello Admin,</p>
      <p><strong>${esc(data.name || 'A new user')}</strong> has registered as a <strong>${esc((data.tier || '').toUpperCase())}</strong> seller.</p>
      <p style="margin-top:8px;">Please review their application in the admin dashboard.</p>
      <p style="margin-top:20px;"><span style="color:${mutedColor};">Platform: Tasara</span></p>
    `,
    'account_deactivated': `
      <p>Hello Admin,</p>
      <p><strong>${esc(data.name || 'A user')}</strong> has deactivated their account.</p>
      <p style="margin-top:20px;"><span style="color:${mutedColor};">Platform: Tasara</span></p>
    `,
  };

  const body = templates[template] || `<p>${esc(data.message || 'You have a new notification.')}</p>`;

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

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
