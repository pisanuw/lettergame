/**
 * send-feedback.js
 *
 * Netlify Function -- POST /send-feedback
 *
 * Sends user feedback to admin via SMTP email.
 * Includes client metadata (IP, browser, screen, etc.) in the email body.
 *
 * Env vars needed:
 *   AUTH_SMTP_HOST, AUTH_SMTP_PORT, AUTH_SMTP_USER, AUTH_SMTP_PASS, AUTH_SMTP_FROM
 *   ADMIN_EMAIL
 */

const nodemailer = require('nodemailer');

const TYPE_LABELS = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  question: 'Question',
  other: 'General Feedback',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { name, email, type, message } = body;

  if (!email || !message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email and message are required' }) };
  }

  const host = process.env.AUTH_SMTP_HOST;
  if (!host) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Email not configured on server' }) };
  }

  // Gather all available metadata
  const clientIp = event.headers['x-forwarded-for']
    || event.headers['x-nf-client-connection-ip']
    || event.headers['client-ip']
    || 'unknown';
  const serverUserAgent = event.headers['user-agent'] || 'unknown';
  const clientCountry = event.headers['x-country'] || event.headers['x-nf-country-code'] || '';
  const acceptLang = event.headers['accept-language'] || '';

  // Client-provided metadata
  const clientUrl = body.url || '';
  const clientReferrer = body.referrer || '';
  const clientUA = body.userAgent || serverUserAgent;
  const clientLanguage = body.language || '';
  const clientScreen = body.screen || '';
  const clientTimestamp = body.timestamp || new Date().toISOString();

  const typeLabel = TYPE_LABELS[type] || type || 'Feedback';

  const emailBody = [
    `Type: ${typeLabel}`,
    `From: ${name || '(not provided)'} <${email}>`,
    '',
    'Message:',
    '─'.repeat(50),
    message,
    '─'.repeat(50),
    '',
    'Client Details:',
    `  IP Address:      ${clientIp}`,
    `  Country:         ${clientCountry || '(not available)'}`,
    `  User-Agent:      ${clientUA}`,
    `  Accept-Language: ${acceptLang || clientLanguage || '(not available)'}`,
    `  Screen Size:     ${clientScreen || '(not available)'}`,
    `  Page URL:        ${clientUrl || '(not available)'}`,
    `  Referrer:        ${clientReferrer || '(none)'}`,
    `  Timestamp:       ${clientTimestamp}`,
  ].join('\n');

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.AUTH_SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.AUTH_SMTP_USER,
        pass: process.env.AUTH_SMTP_PASS,
      },
    });

    const adminEmail = process.env.ADMIN_EMAIL || 'yusuf.pisan@gmail.com';

    await transporter.sendMail({
      from: process.env.AUTH_SMTP_FROM || 'noreply@lettergame.app',
      replyTo: email,
      to: adminEmail,
      subject: `[Letter Game] ${typeLabel}: ${message.slice(0, 60)}${message.length > 60 ? '...' : ''}`,
      text: emailBody,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sent: true }),
    };
  } catch (err) {
    console.error('SMTP error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send email' }),
    };
  }
};
