const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// Life Areas
router.get('/life-areas', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM life_areas ORDER BY name');
  res.json(rows);
});

router.post('/life-areas', async (req, res) => {
  const { name, colour, icon } = req.body;
  const { rows } = await db.query('INSERT INTO life_areas (name,colour,icon) VALUES ($1,$2,$3) RETURNING *', [name, colour, icon]);
  res.status(201).json(rows[0]);
});

// Goals
router.get('/', async (req, res) => {
  const { status, life_area_id } = req.query;
  let q = `SELECT g.*, la.name as area_name, la.colour as area_colour,
           (SELECT COUNT(*) FROM milestones m WHERE m.goal_id = g.id) as milestone_count,
           (SELECT COUNT(*) FROM milestones m WHERE m.goal_id = g.id AND m.completed = true) as milestones_done
           FROM goals g LEFT JOIN life_areas la ON la.id = g.life_area_id WHERE 1=1`;
  const params = [];
  let p = 1;
  if (status) { q += ` AND g.status=$${p++}`; params.push(status); }
  if (life_area_id) { q += ` AND g.life_area_id=$${p++}`; params.push(life_area_id); }
  q += ' ORDER BY g.priority DESC, g.created_at DESC';
  const { rows } = await db.query(q, params);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { life_area_id, title, description, status, priority, target_date, progress, parent_goal_id } = req.body;
  const { rows } = await db.query(
    `INSERT INTO goals (life_area_id,title,description,status,priority,target_date,progress,parent_goal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [life_area_id || null, title, description || null, status || 'active', priority || 'medium',
     target_date || null, progress || 0, parent_goal_id || null]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const fields = ['title','description','status','priority','target_date','progress','life_area_id'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields' });
  const sets = updates.map((f, i) => `${f}=$${i + 1}`).join(',');
  const extra = req.body.status === 'completed' ? `, completed_at=NOW()` : '';
  const { rows } = await db.query(
    `UPDATE goals SET ${sets}${extra} WHERE id=$${updates.length + 1} RETURNING *`,
    [...updates.map(f => req.body[f]), req.params.id]
  );
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM goals WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// Milestones
router.get('/:id/milestones', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM milestones WHERE goal_id=$1 ORDER BY due_date ASC NULLS LAST', [req.params.id]);
  res.json(rows);
});

router.post('/:id/milestones', async (req, res) => {
  const { title, due_date } = req.body;
  const { rows } = await db.query('INSERT INTO milestones (goal_id,title,due_date) VALUES ($1,$2,$3) RETURNING *', [req.params.id, title, due_date || null]);
  res.status(201).json(rows[0]);
});

router.patch('/milestones/:id', async (req, res) => {
  const { completed } = req.body;
  const { rows } = await db.query(
    'UPDATE milestones SET completed=$1, completed_at=$2 WHERE id=$3 RETURNING *',
    [completed, completed ? new Date() : null, req.params.id]
  );
  res.json(rows[0]);
});

module.exports = router;
