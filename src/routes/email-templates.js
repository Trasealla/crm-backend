import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

async function ensureTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subject VARCHAR(500) NOT NULL,
      body TEXT NOT NULL,
      category VARCHAR(100),
      placeholders JSON,
      is_active TINYINT(1) DEFAULT 1,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { category, active } = req.query;
    let sql = `
      SELECT et.*, s.full_name as created_by_name
      FROM email_templates et
      LEFT JOIN staff s ON et.created_by = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (category) { sql += ' AND et.category = ?'; params.push(category); }
    if (active !== undefined) { sql += ' AND et.is_active = ?'; params.push(active === 'true' ? 1 : 0); }
    sql += ' ORDER BY et.name';
    
    const templates = await query(sql, params);
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch email templates' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { name, subject, body, category, placeholders, is_active } = req.body;
    
    if (!name || !subject || !body) {
      return res.status(400).json({ success: false, message: 'Name, subject, and body required' });
    }
    
    const result = await execute(
      'INSERT INTO email_templates (name, subject, body, category, placeholders, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, subject, body, category || null, placeholders ? JSON.stringify(placeholders) : null, is_active !== false ? 1 : 0, req.user.id]
    );
    res.json({ success: true, message: 'Email template created', data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create email template' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const fields = ['name', 'subject', 'body', 'category', 'placeholders', 'is_active'];
    const updates = [];
    const params = [];
    
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        let value = req.body[f];
        if (f === 'is_active') value = value ? 1 : 0;
        if (f === 'placeholders') value = value ? JSON.stringify(value) : null;
        params.push(value);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, message: 'No updates' });
    
    params.push(req.params.id);
    await execute(`UPDATE email_templates SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Email template updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update email template' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await execute('DELETE FROM email_templates WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Email template deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete email template' });
  }
});

export default router;


