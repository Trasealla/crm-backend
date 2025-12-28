import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

async function ensureTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      name_ar VARCHAR(255),
      code VARCHAR(50) UNIQUE,
      address TEXT,
      city VARCHAR(100),
      country VARCHAR(100) DEFAULT 'UAE',
      phone VARCHAR(50),
      email VARCHAR(255),
      manager_id INT,
      is_headquarters TINYINT(1) DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      timezone VARCHAR(50) DEFAULT 'Asia/Dubai',
      currency VARCHAR(10) DEFAULT 'AED',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const branches = await query(`
      SELECT b.*, s.full_name as manager_name
      FROM branches b LEFT JOIN staff s ON b.manager_id = s.id
      ORDER BY b.is_headquarters DESC, b.name
    `);
    res.json({ success: true, data: branches });
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch branches' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { name, name_ar, code, address, city, country, phone, email, manager_id, is_headquarters, is_active, timezone, currency } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Branch name required' });
    
    const result = await execute(
      `INSERT INTO branches (name, name_ar, code, address, city, country, phone, email, manager_id, is_headquarters, is_active, timezone, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, name_ar || null, code || null, address || null, city || null, country || 'UAE', phone || null, email || null,
       manager_id || null, is_headquarters ? 1 : 0, is_active !== false ? 1 : 0, timezone || 'Asia/Dubai', currency || 'AED']
    );
    res.json({ success: true, message: 'Branch created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create branch error:', error);
    res.status(500).json({ success: false, message: 'Failed to create branch' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const fields = ['name', 'name_ar', 'code', 'address', 'city', 'country', 'phone', 'email', 'manager_id', 'is_headquarters', 'is_active', 'timezone', 'currency'];
    const updates = [];
    const params = [];
    
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        let value = req.body[f];
        if (f === 'is_headquarters' || f === 'is_active') value = value ? 1 : 0;
        if (f === 'manager_id' && value === '') value = null;
        params.push(value);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, message: 'No updates' });
    
    params.push(req.params.id);
    await execute(`UPDATE branches SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Branch updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update branch' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await execute('DELETE FROM branches WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Branch deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete branch' });
  }
});

export default router;


