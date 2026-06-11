const express = require('express');
const router  = express.Router();
const db      = require('../db/pool');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const clip = (v, max = 500) => v == null ? v : String(v).slice(0, max);

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════

/**
 * Suggest a priority level for a debt based on type and creditor.
 * The user can override this via the `priority_level` column; this is just
 * the default we apply on insert and surface in the UI as a hint.
 *
 * UK priority debt framework (Citizens Advice / StepChange consensus):
 *   critical — non-payment risks home loss, liberty, child welfare
 *   high     — essential services or strong enforcement powers
 *   standard — most consumer credit
 *   low      — personal debts, statute-barred
 */
function suggestedPriority(debtType, creditorType) {
    const critical = ['mortgage','secured_loan','rent','council_tax','court_fine','child_maintenance'];
    const high     = ['tax','utility','tv_licence','student_loan'];
    const low      = ['personal'];

    if (critical.includes(debtType)) return 'critical';
    if (high.includes(debtType))     return 'high';
    if (low.includes(debtType))      return 'low';

    // Creditor-type hints when debt_type is generic
    if (creditorType === 'bailiff' || creditorType === 'court') return 'critical';
    if (creditorType === 'hmrc' || creditorType === 'council')  return 'high';

    return 'standard';
}

/**
 * Compute statute-barred date suggestion (England & Wales).
 * Limitation Act 1980:
 *   - Simple contract (most consumer debt): 6 years from cause of action OR last payment OR last written acknowledgement
 *   - CCJs / judgement debts: NEVER statute-barred (though enforcement after 6 years needs court permission)
 *   - Mortgage capital: 12 years
 *   - HMRC: no limitation
 *   - Council tax: 6 years from when it became due (Magistrates rules)
 *
 * Returns null when the rule doesn't apply (CCJ, HMRC) — those debts never expire.
 */
function suggestedStatuteBarredDate(debt) {
    if (debt.ccj_judgement_date) return null;
    if (debt.debt_type === 'tax')        return null;
    if (debt.debt_type === 'mortgage')   {
        if (!debt.agreement_date) return null;
        const d = new Date(debt.agreement_date);
        d.setFullYear(d.getFullYear() + 12);
        return d.toISOString().split('T')[0];
    }
    // General 6-year rule — use the latest of (default_date, last_payment_date, last_acknowledgement_date)
    const anchors = [debt.default_date, debt.last_payment_date, debt.last_acknowledgement_date]
        .filter(Boolean)
        .map(d => new Date(d));
    if (anchors.length === 0) return null;
    const latest = new Date(Math.max(...anchors.map(d => d.getTime())));
    latest.setFullYear(latest.getFullYear() + 6);
    return latest.toISOString().split('T')[0];
}

/**
 * Enrich a debt row with computed fields:
 *   - total_paid (sum of payment records)
 *   - remaining_balance (current_balance or original_amount minus payments depending on plan)
 *   - is_overdue (true if active plan has next_due_date in the past)
 *   - days_overdue (computed against next_due_date)
 *   - is_statute_barred (true if statute_barred_date is in the past)
 *   - active_plan (joined active plan if present)
 */
async function enrichDebt(debt) {
    // Sum of payments
    const { rows: payRows } = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) AS total_paid,
                COUNT(*) AS payment_count,
                MAX(date) AS last_payment_date
         FROM debt_payments WHERE debt_id = $1`,
        [debt.id]
    );
    const totalPaid = parseFloat(payRows[0].total_paid);
    const paymentCount = parseInt(payRows[0].payment_count, 10);

    // Active plan
    const { rows: planRows } = await db.query(
        `SELECT * FROM debt_plans WHERE debt_id = $1 AND is_active = TRUE LIMIT 1`,
        [debt.id]
    );
    const activePlan = planRows[0] || null;

    // Overdue calc
    let isOverdue = false;
    let daysOverdue = 0;
    if (activePlan && activePlan.next_due_date) {
        const due = new Date(activePlan.next_due_date);
        const today = new Date(); today.setHours(0,0,0,0);
        if (due < today) {
            isOverdue = true;
            daysOverdue = Math.floor((today - due) / (24 * 60 * 60 * 1000));
        }
    }

    // Statute-barred check
    let isStatuteBarred = false;
    if (debt.statute_barred_date) {
        isStatuteBarred = new Date(debt.statute_barred_date) <= new Date();
    }

    return {
        ...debt,
        total_paid:           totalPaid,
        payment_count:        paymentCount,
        last_recorded_payment: payRows[0].last_payment_date,
        active_plan:          activePlan,
        is_overdue:           isOverdue,
        days_overdue:         daysOverdue,
        is_statute_barred:    isStatuteBarred,
        suggested_priority:   suggestedPriority(debt.debt_type, debt.creditor_type),
        suggested_statute_barred_date: suggestedStatuteBarredDate(debt),
    };
}

function computeNextDueDate(plan, fromDate) {
    if (!plan || plan.frequency === 'one_off') return null;
    const d = new Date(fromDate || plan.start_date);
    switch (plan.frequency) {
        case 'weekly':       d.setDate(d.getDate() + 7); break;
        case 'fortnightly':  d.setDate(d.getDate() + 14); break;
        case 'four_weekly':  d.setDate(d.getDate() + 28); break;
        case 'monthly':      d.setMonth(d.getMonth() + 1); break;
        case 'quarterly':    d.setMonth(d.getMonth() + 3); break;
        default:             return null;
    }
    return d.toISOString().split('T')[0];
}

async function logInteraction(debtId, type, summary, notes = null) {
    return db.query(
        `INSERT INTO debt_interactions (debt_id, type, summary, notes) VALUES ($1, $2, $3, $4)`,
        [debtId, type, clip(summary, 500), clip(notes, 2000)]
    );
}

// ══════════════════════════════════════════════════════════════════════════
// DEBTS — CRUD
// ══════════════════════════════════════════════════════════════════════════

router.get('/', asyncHandler(async (req, res) => {
    const { direction, status, priority, debt_type, archived } = req.query;
    let q = 'SELECT * FROM debts WHERE 1=1';
    const params = [];
    let i = 1;
    // Archived filter — default false unless explicitly requested
    if (archived === 'true')      { q += ` AND is_archived = TRUE`; }
    else if (archived === 'all')  { /* no filter */ }
    else                          { q += ` AND is_archived = FALSE`; }
    if (direction)  { q += ` AND direction = $${i++}`;    params.push(direction); }
    if (status)     { q += ` AND status = $${i++}`;       params.push(status); }
    if (priority)   { q += ` AND priority_level = $${i++}`; params.push(priority); }
    if (debt_type)  { q += ` AND debt_type = $${i++}`;    params.push(debt_type); }
    q += ` ORDER BY
        CASE priority_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'standard' THEN 3 ELSE 4 END,
        current_balance DESC NULLS LAST`;
    const { rows } = await db.query(q, params);
    const enriched = await Promise.all(rows.map(enrichDebt));
    res.json(enriched);
}));

router.get('/dashboard', asyncHandler(async (req, res) => {
    const { rows: totals } = await db.query(`
        SELECT direction,
               COALESCE(SUM(current_balance), 0)::NUMERIC(12,2) AS total_balance,
               COUNT(*) AS count
        FROM debts
        WHERE is_archived = FALSE
          AND status NOT IN ('settled','ccj_satisfied','written_off')
        GROUP BY direction
    `);
    const { rows: byPriority } = await db.query(`
        SELECT priority_level,
               COALESCE(SUM(current_balance), 0)::NUMERIC(12,2) AS total,
               COUNT(*) AS count
        FROM debts
        WHERE is_archived = FALSE
          AND direction = 'owed_by_me'
          AND status NOT IN ('settled','ccj_satisfied','written_off')
        GROUP BY priority_level
    `);
    const { rows: priorityDebts } = await db.query(`
        SELECT id, creditor_name, debt_type, current_balance, priority_level, status
        FROM debts
        WHERE is_archived = FALSE
          AND direction = 'owed_by_me'
          AND priority_level IN ('critical','high')
          AND status NOT IN ('settled','ccj_satisfied','written_off')
        ORDER BY priority_level, current_balance DESC
        LIMIT 10
    `);
    const { rows: upcomingPayments } = await db.query(`
        SELECT d.id, d.creditor_name, p.next_due_date, p.amount, p.frequency
        FROM debt_plans p
        JOIN debts d ON d.id = p.debt_id
        WHERE p.is_active = TRUE
          AND p.next_due_date IS NOT NULL
          AND p.next_due_date <= CURRENT_DATE + INTERVAL '14 days'
          AND d.is_archived = FALSE
        ORDER BY p.next_due_date ASC
        LIMIT 20
    `);
    const { rows: recentPayments } = await db.query(`
        SELECT p.*, d.creditor_name
        FROM debt_payments p
        JOIN debts d ON d.id = p.debt_id
        WHERE d.is_archived = FALSE
        ORDER BY p.date DESC, p.created_at DESC
        LIMIT 10
    `);
    res.json({
        totals,
        by_priority: byPriority,
        priority_debts: priorityDebts,
        upcoming_payments: upcomingPayments,
        recent_payments: recentPayments,
    });
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const { rows } = await db.query('SELECT * FROM debts WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Debt not found' });
    const enriched = await enrichDebt(rows[0]);
    res.json(enriched);
}));

const ALL_FIELDS = [
    'direction','debt_type','priority_level','status',
    'creditor_name','creditor_type','original_creditor',
    'contact_phone','contact_email','contact_address',
    'account_reference','their_reference',
    'original_amount','current_balance','currency','interest_rate',
    'agreement_date','default_date','last_payment_date','last_acknowledgement_date','statute_barred_date',
    'ccj_case_number','ccj_court','ccj_judgement_date','ccj_judgement_amount','ccj_satisfied_date',
    'secured_against','notes','metadata','is_archived',
];

router.post('/', asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.direction)       return res.status(400).json({ error: 'direction required' });
    if (!b.debt_type)       return res.status(400).json({ error: 'debt_type required' });
    if (!b.creditor_name)   return res.status(400).json({ error: 'creditor_name required' });
    if (b.original_amount == null) return res.status(400).json({ error: 'original_amount required' });

    // Auto-suggest priority if not provided
    const priority = b.priority_level || suggestedPriority(b.debt_type, b.creditor_type);
    const balance  = b.current_balance != null ? b.current_balance : b.original_amount;

    // If a CCJ was supplied with a judgement date, default status to ccj_active
    let status = b.status || 'active';
    if (b.ccj_judgement_date && !b.ccj_satisfied_date) status = 'ccj_active';
    if (b.ccj_satisfied_date) status = 'ccj_satisfied';

    const { rows } = await db.query(
        `INSERT INTO debts (
            direction, debt_type, priority_level, status,
            creditor_name, creditor_type, original_creditor,
            contact_phone, contact_email, contact_address,
            account_reference, their_reference,
            original_amount, current_balance, currency, interest_rate,
            agreement_date, default_date, last_payment_date, last_acknowledgement_date, statute_barred_date,
            ccj_case_number, ccj_court, ccj_judgement_date, ccj_judgement_amount, ccj_satisfied_date,
            secured_against, notes, metadata
         ) VALUES (
            $1,$2,$3,$4, $5,$6,$7, $8,$9,$10, $11,$12,
            $13,$14,$15,$16,
            $17,$18,$19,$20,$21,
            $22,$23,$24,$25,$26,
            $27,$28,$29::jsonb
         ) RETURNING *`,
        [
            b.direction, b.debt_type, priority, status,
            clip(b.creditor_name), b.creditor_type || null, clip(b.original_creditor),
            clip(b.contact_phone), clip(b.contact_email), clip(b.contact_address, 1000),
            clip(b.account_reference), clip(b.their_reference),
            b.original_amount, balance, b.currency || 'GBP', b.interest_rate || null,
            b.agreement_date || null, b.default_date || null, b.last_payment_date || null,
            b.last_acknowledgement_date || null, b.statute_barred_date || null,
            clip(b.ccj_case_number), clip(b.ccj_court), b.ccj_judgement_date || null,
            b.ccj_judgement_amount || null, b.ccj_satisfied_date || null,
            clip(b.secured_against), clip(b.notes, 2000),
            JSON.stringify(b.metadata || {}),
        ]
    );
    await logInteraction(rows[0].id, 'note', 'Debt record created');
    const enriched = await enrichDebt(rows[0]);
    res.status(201).json(enriched);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
    const updates = ALL_FIELDS.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    const values = updates.map(f => {
        const v = req.body[f];
        if (f === 'metadata') return JSON.stringify(v || {});
        if (typeof v === 'string') return clip(v, 2000);
        return v;
    });
    const sets = updates.map((f, i) =>
        f === 'metadata' ? `${f}=$${i + 1}::jsonb` : `${f}=$${i + 1}`
    ).join(',');

    const { rows } = await db.query(
        `UPDATE debts SET ${sets} WHERE id=$${updates.length + 1} RETURNING *`,
        [...values, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Debt not found' });

    // Log status changes
    if (req.body.status) {
        await logInteraction(req.params.id, 'status_change', `Status changed to ${req.body.status}`);
    }

    const enriched = await enrichDebt(rows[0]);
    res.json(enriched);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
    // Cascade via FK; if you wanted soft delete instead, set is_archived=TRUE
    const { rowCount } = await db.query('DELETE FROM debts WHERE id=$1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Debt not found' });
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════════════════════════════════════════

router.get('/:id/payments', asyncHandler(async (req, res) => {
    const { rows } = await db.query(
        `SELECT * FROM debt_payments WHERE debt_id=$1 ORDER BY date DESC, created_at DESC`,
        [req.params.id]
    );
    res.json(rows);
}));

router.post('/:id/payments', asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (b.amount == null || !b.date) {
        return res.status(400).json({ error: 'amount and date required' });
    }

    // Insert payment + reduce balance + advance plan next_due_date in a transaction
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const { rows: pRows } = await client.query(
            `INSERT INTO debt_payments (debt_id, amount, date, method, reference, notes)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [req.params.id, b.amount, b.date, b.method || null,
             clip(b.reference), clip(b.notes, 1000)]
        );

        // Reduce balance + update last_payment_date
        await client.query(
            `UPDATE debts
                SET current_balance = GREATEST(0, current_balance - $1::NUMERIC),
                    last_payment_date = GREATEST(COALESCE(last_payment_date, '1970-01-01'::DATE), $2::DATE)
              WHERE id = $3`,
            [b.amount, b.date, req.params.id]
        );

        // Advance active plan's next_due_date if applicable
        const { rows: plans } = await client.query(
            `SELECT * FROM debt_plans WHERE debt_id=$1 AND is_active = TRUE LIMIT 1`,
            [req.params.id]
        );
        if (plans[0] && plans[0].frequency !== 'one_off') {
            const newDue = computeNextDueDate(plans[0], plans[0].next_due_date || b.date);
            if (newDue) {
                await client.query(
                    `UPDATE debt_plans SET next_due_date=$1 WHERE id=$2`,
                    [newDue, plans[0].id]
                );
            }
        }

        // If balance just hit zero, suggest status transition
        const { rows: debtRows } = await client.query(
            `SELECT current_balance, status FROM debts WHERE id=$1`,
            [req.params.id]
        );
        if (debtRows[0] && parseFloat(debtRows[0].current_balance) === 0) {
            const newStatus = debtRows[0].status === 'ccj_active' ? 'ccj_satisfied' : 'settled';
            await client.query(
                `UPDATE debts SET status=$1, ccj_satisfied_date = CASE WHEN status='ccj_active' THEN CURRENT_DATE ELSE ccj_satisfied_date END WHERE id=$2`,
                [newStatus, req.params.id]
            );
            // Also deactivate any plan
            await client.query(
                `UPDATE debt_plans SET is_active=FALSE WHERE debt_id=$1 AND is_active = TRUE`,
                [req.params.id]
            );
        }

        await client.query(
            `INSERT INTO debt_interactions (debt_id, type, summary)
             VALUES ($1, 'payment', $2)`,
            [req.params.id, `Payment of ${b.amount} recorded`]
        );

        await client.query('COMMIT');
        res.status(201).json(pRows[0]);
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}));

router.delete('/:id/payments/:paymentId', asyncHandler(async (req, res) => {
    // Reverse the balance change
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `DELETE FROM debt_payments WHERE id=$1 AND debt_id=$2 RETURNING amount`,
            [req.params.paymentId, req.params.id]
        );
        if (rows[0]) {
            await client.query(
                `UPDATE debts SET current_balance = current_balance + $1::NUMERIC WHERE id = $2`,
                [rows[0].amount, req.params.id]
            );
        }
        await client.query('COMMIT');
        res.status(204).end();
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}));

// ══════════════════════════════════════════════════════════════════════════
// PAYMENT PLANS
// ══════════════════════════════════════════════════════════════════════════

router.get('/:id/plans', asyncHandler(async (req, res) => {
    const { rows } = await db.query(
        `SELECT * FROM debt_plans WHERE debt_id=$1 ORDER BY created_at DESC`,
        [req.params.id]
    );
    res.json(rows);
}));

router.post('/:id/plans', asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.frequency || b.amount == null || !b.start_date) {
        return res.status(400).json({ error: 'frequency, amount, start_date required' });
    }

    // Deactivate any existing active plan first
    await db.query(
        `UPDATE debt_plans SET is_active=FALSE WHERE debt_id=$1 AND is_active = TRUE`,
        [req.params.id]
    );

    const nextDue = b.frequency === 'one_off' ? null : b.start_date;

    const { rows } = await db.query(
        `INSERT INTO debt_plans (debt_id, frequency, amount, start_date, end_date,
                                 next_due_date, agreement_reference, agreement_date, notes, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, TRUE) RETURNING *`,
        [req.params.id, b.frequency, b.amount, b.start_date, b.end_date || null,
         nextDue, clip(b.agreement_reference), b.agreement_date || null, clip(b.notes, 1000)]
    );

    // Move debt to payment_plan status if it isn't already in a more specific state
    await db.query(
        `UPDATE debts SET status='payment_plan'
         WHERE id=$1 AND status NOT IN ('ccj_active','ccj_satisfied','enforcement','settled','written_off')`,
        [req.params.id]
    );

    await logInteraction(req.params.id, 'note', `Payment plan created: ${b.amount} ${b.frequency}`);
    res.status(201).json(rows[0]);
}));

router.patch('/:id/plans/:planId', asyncHandler(async (req, res) => {
    const fields = ['frequency','amount','start_date','end_date','next_due_date',
                    'agreement_reference','agreement_date','notes','is_active'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
    const { rows } = await db.query(
        `UPDATE debt_plans SET ${sets} WHERE id=$${updates.length + 1} AND debt_id=$${updates.length + 2} RETURNING *`,
        [...updates.map(f => req.body[f]), req.params.planId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Plan not found' });
    res.json(rows[0]);
}));

router.delete('/:id/plans/:planId', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM debt_plans WHERE id=$1 AND debt_id=$2', [req.params.planId, req.params.id]);
    res.status(204).end();
}));

// ══════════════════════════════════════════════════════════════════════════
// INTERACTIONS
// ══════════════════════════════════════════════════════════════════════════

router.get('/:id/interactions', asyncHandler(async (req, res) => {
    const { rows } = await db.query(
        `SELECT * FROM debt_interactions WHERE debt_id=$1 ORDER BY date DESC, created_at DESC`,
        [req.params.id]
    );
    res.json(rows);
}));

router.post('/:id/interactions', asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.type || !b.summary) return res.status(400).json({ error: 'type and summary required' });
    const { rows } = await db.query(
        `INSERT INTO debt_interactions (debt_id, type, date, summary, notes)
         VALUES ($1, $2, COALESCE($3::TIMESTAMPTZ, NOW()), $4, $5) RETURNING *`,
        [req.params.id, b.type, b.date || null, clip(b.summary), clip(b.notes, 2000)]
    );
    res.status(201).json(rows[0]);
}));

router.delete('/:id/interactions/:interactionId', asyncHandler(async (req, res) => {
    await db.query('DELETE FROM debt_interactions WHERE id=$1 AND debt_id=$2',
        [req.params.interactionId, req.params.id]);
    res.status(204).end();
}));

module.exports = router;
