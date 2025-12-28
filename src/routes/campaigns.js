import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

async function ensureTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type ENUM('email', 'sms', 'whatsapp', 'social', 'other') NOT NULL DEFAULT 'email',
      status ENUM('draft', 'scheduled', 'running', 'completed', 'cancelled') DEFAULT 'draft',
      start_date DATETIME,
      end_date DATETIME,
      budget DECIMAL(15, 2),
      actual_cost DECIMAL(15, 2) DEFAULT 0,
      target_audience JSON,
      description TEXT,
      total_sent INT DEFAULT 0,
      total_opened INT DEFAULT 0,
      total_clicked INT DEFAULT 0,
      total_converted INT DEFAULT 0,
      owner_id INT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { type, status } = req.query;
    let sql = `
      SELECT c.*, s.full_name as owner_name
      FROM campaigns c
      LEFT JOIN staff s ON c.owner_id = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (type) { sql += ' AND c.type = ?'; params.push(type); }
    if (status) { sql += ' AND c.status = ?'; params.push(status); }
    sql += ' ORDER BY c.created_at DESC';
    
    const campaigns = await query(sql, params);
    res.json({ success: true, data: campaigns });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch campaigns' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { name, type, status, start_date, end_date, budget, target_audience, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Campaign name required' });
    
    // Handle empty strings as null for date and numeric fields
    const cleanStartDate = start_date && start_date.trim() !== '' ? start_date : null;
    const cleanEndDate = end_date && end_date.trim() !== '' ? end_date : null;
    const cleanBudget = budget && budget !== '' ? parseFloat(budget) : null;
    
    const result = await execute(
      `INSERT INTO campaigns (name, type, status, start_date, end_date, budget, target_audience, description, owner_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, type || 'email', status || 'draft', cleanStartDate, cleanEndDate, cleanBudget,
       target_audience ? JSON.stringify(target_audience) : null, description || null, req.user.id, req.user.id]
    );
    res.json({ success: true, message: 'Campaign created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Campaign creation error:', error);
    res.status(500).json({ success: false, message: 'Failed to create campaign', error: error.message });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const dateFields = ['start_date', 'end_date'];
    const numericFields = ['budget', 'actual_cost', 'total_sent', 'total_opened', 'total_clicked', 'total_converted'];
    const fields = ['name', 'type', 'status', 'start_date', 'end_date', 'budget', 'actual_cost', 'target_audience', 'description', 'total_sent', 'total_opened', 'total_clicked', 'total_converted'];
    const updates = [];
    const params = [];
    
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        let value = req.body[f];
        
        // Handle empty strings for date fields
        if (dateFields.includes(f) && (!value || value.trim() === '')) {
          value = null;
        }
        // Handle empty strings for numeric fields  
        if (numericFields.includes(f) && (value === '' || value === null)) {
          value = null;
        } else if (numericFields.includes(f) && value) {
          value = parseFloat(value);
        }
        // Handle JSON fields
        if (f === 'target_audience' && value) {
          value = typeof value === 'string' ? value : JSON.stringify(value);
        }
        
        params.push(value);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, message: 'No updates' });
    
    params.push(req.params.id);
    await execute(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Campaign updated' });
  } catch (error) {
    console.error('Campaign update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update campaign', error: error.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await execute('DELETE FROM campaigns WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete campaign' });
  }
});

export default router;

