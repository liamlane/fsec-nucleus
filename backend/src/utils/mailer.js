// backend/src/utils/mailer.js
//
// SMTP sending via nodemailer with mandatory logging to email_log.
// Every send attempt — success or failure — produces a row in email_log.
// SMTP credentials are stored in app_settings and editable via the UI;
// transport is created fresh on each send (low-volume single-user app,
// connection pooling overhead is not worth the complexity).

const nodemailer = require('nodemailer');
const db = require('../db/pool');

async function getSmtpConfig() {
    const { rows } = await db.query(
        `SELECT value FROM app_settings WHERE key = 'smtp_config'`
    );
    return rows[0] ? rows[0].value : null;
}

async function getTemplates() {
    const { rows } = await db.query(
        `SELECT value FROM app_settings WHERE key = 'email_templates'`
    );
    return rows[0] ? rows[0].value : {};
}

function createTransport(config) {
    return nodemailer.createTransport({
        host: config.host,
        port: parseInt(config.port, 10) || 587,
        secure: !!config.secure,             // true for 465 (SSL); false for 587 (STARTTLS)
        requireTLS: !config.secure,          // demand STARTTLS upgrade on port 587
        auth: {
            user: config.user,
            pass: config.pass,
        },
        tls: {
            rejectUnauthorized: !config.allow_self_signed,
        },
        // Tight timeouts so a misconfigured server doesn't hang the request
        connectionTimeout: 10000,
        greetingTimeout:   10000,
        socketTimeout:     20000,
    });
}

async function logEmail(entry) {
    const { rows } = await db.query(
        `INSERT INTO email_log
           (to_address, cc_address, bcc_address, subject, body, attachments,
            related_type, related_id, status, error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
            entry.to,
            entry.cc || null,
            entry.bcc || null,
            entry.subject,
            entry.body || null,
            entry.attachments || [],
            entry.related_type || null,
            entry.related_id || null,
            entry.status,
            entry.error || null,
        ]
    );
    return rows[0].id;
}

function buildFromHeader(config) {
    const addr = config.from_email || config.user;
    if (!addr) throw new Error('SMTP from_email not configured');
    return config.from_name ? `"${config.from_name}" <${addr}>` : addr;
}

/**
 * Send an email and log it (regardless of outcome).
 *
 * @param {Object} opts
 * @param {string}        opts.to              Required recipient
 * @param {string}        [opts.cc]
 * @param {string}        [opts.bcc]
 * @param {string}        opts.subject
 * @param {string}        [opts.text]          Plain-text body
 * @param {string}        [opts.html]          HTML body
 * @param {Array<Object>} [opts.attachments]   [{ filename, content (Buffer), contentType }]
 * @param {string}        [opts.related_type]  e.g. 'invoice', 'quote', 'reminder', 'smtp_test'
 * @param {string}        [opts.related_id]    UUID of the related record
 *
 * @returns {Promise<{ ok: true, log_id: string }>}
 * @throws on send failure (after logging the failure)
 */
async function sendMail(opts) {
    if (!opts || !opts.to || !opts.subject) {
        throw new Error('sendMail requires to and subject');
    }

    const config = await getSmtpConfig();
    if (!config || !config.host || !config.user || !config.pass) {
        const err = new Error('SMTP is not configured. Go to Business → Profile → SMTP to set it up.');
        // Don't try to log this — without a config we can still log the attempt
        await logEmail({
            to: opts.to, cc: opts.cc, bcc: opts.bcc,
            subject: opts.subject, body: opts.text || opts.html,
            attachments: (opts.attachments || []).map(a => a.filename),
            related_type: opts.related_type, related_id: opts.related_id,
            status: 'failed', error: err.message,
        });
        throw err;
    }

    const transport = createTransport(config);
    const from = buildFromHeader(config);

    const mailOptions = {
        from,
        to: opts.to,
        subject: opts.subject,
    };
    if (opts.cc)            mailOptions.cc = opts.cc;
    if (opts.bcc)           mailOptions.bcc = opts.bcc;
    if (opts.text)          mailOptions.text = opts.text;
    if (opts.html)          mailOptions.html = opts.html;
    if (config.reply_to)    mailOptions.replyTo = config.reply_to;
    if (opts.attachments && opts.attachments.length) {
        mailOptions.attachments = opts.attachments.map(a => ({
            filename:    a.filename,
            content:     a.content,
            contentType: a.contentType || 'application/octet-stream',
        }));
    }

    try {
        await transport.sendMail(mailOptions);
        const log_id = await logEmail({
            to: opts.to, cc: opts.cc, bcc: opts.bcc,
            subject: opts.subject,
            body: opts.text || opts.html,
            attachments: (opts.attachments || []).map(a => a.filename),
            related_type: opts.related_type, related_id: opts.related_id,
            status: 'sent',
        });
        return { ok: true, log_id };
    } catch (e) {
        await logEmail({
            to: opts.to, cc: opts.cc, bcc: opts.bcc,
            subject: opts.subject,
            body: opts.text || opts.html,
            attachments: (opts.attachments || []).map(a => a.filename),
            related_type: opts.related_type, related_id: opts.related_id,
            status: 'failed', error: e.message,
        });
        throw e;
    }
}

/** Verify SMTP connection without sending — used by the test button. */
async function verifyConnection() {
    const config = await getSmtpConfig();
    if (!config || !config.host) throw new Error('SMTP not configured');
    const transport = createTransport(config);
    return transport.verify();
}

/** Fill {placeholder}s in a template string. */
function fillTemplate(str, vars) {
    if (!str) return '';
    return str.replace(/\{(\w+)\}/g, (m, key) => (vars[key] !== undefined ? String(vars[key]) : m));
}

module.exports = {
    sendMail,
    verifyConnection,
    getSmtpConfig,
    getTemplates,
    fillTemplate,
};
