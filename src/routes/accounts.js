import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Get all accounts
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const tenantId = req.tenantId;
    
    let sql = `
      SELECT a.*, s.full_name as owner_name,
             (SELECT COUNT(*) FROM contacts WHERE account_id = a.id) as contact_count,
             (SELECT COUNT(*) FROM deals WHERE account_id = a.id) as deal_count
      FROM accounts a
      LEFT JOIN staff s ON a.owner_id = s.id
      WHERE a.tenant_id = ?
    `;
    const params = [tenantId];
    
    if (status) { sql += ' AND a.status = ?'; params.push(status); }
    if (search) { sql += ' AND (a.name LIKE ? OR a.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    
    sql += ` ORDER BY a.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    const accounts = await query(sql, params);
    const [countResult] = await query('SELECT COUNT(*) as total FROM accounts WHERE tenant_id = ?', [tenantId]);
    
    res.json({ success: true, data: accounts, total: countResult.total });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch accounts' });
  }
});

// Get single account
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const accounts = await query('SELECT * FROM accounts WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
    if (accounts.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }
    res.json({ success: true, data: accounts[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch account' });
  }
});

// Create account
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, industry, website, phone, email, address, city, country, status, owner_id } = req.body;
    const tenantId = req.tenantId;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Account name is required' });
    }
    
    const result = await execute(
      `INSERT INTO accounts (tenant_id, name, industry, website, phone, email, address, city, country, status, owner_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, name, industry || null, website || null, phone || null, email || null, address || null, 
       city || null, country || null, status || 'active', owner_id || req.user.id, req.user.id]
    );
    
    res.json({ success: true, message: 'Account created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ success: false, message: 'Failed to create account' });
  }
});

// Update account
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const fields = ['name', 'industry', 'website', 'phone', 'email', 'address', 'city', 'country', 'status', 'owner_id'];
    const updates = [];
    const params = [];
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(req.body[field] || null);
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No updates provided' });
    }
    
    params.push(id, tenantId);
    await execute(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
    
    res.json({ success: true, message: 'Account updated' });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({ success: false, message: 'Failed to update account' });
  }
});

// Delete account
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    await execute('DELETE FROM accounts WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete account' });
  }
});

export default router;
