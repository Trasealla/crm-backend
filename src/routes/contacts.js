import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';

const router = express.Router();

/**
 * Get all contacts for the current tenant
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, account_id, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const tenantId = req.tenantId;
    
    let sql = `
      SELECT c.*, a.name as account_name, s.full_name as owner_name
      FROM contacts c
      LEFT JOIN accounts a ON c.account_id = a.id
      LEFT JOIN staff s ON c.owner_id = s.id
      WHERE 1=1
    `;
    const params = [];
    
    // Filter by tenant (if not platform owner)
    if (tenantId) {
      sql += ' AND c.tenant_id = ?';
      params.push(tenantId);
    }
    
    if (account_id) { sql += ' AND c.account_id = ?'; params.push(account_id); }
    if (search) { 
      sql += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)'; 
      params.push(`%${search}%`, `%${search}%`, `%${search}%`); 
    }
    
    sql += ` ORDER BY c.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    const contacts = await query(sql, params);
    
    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM contacts WHERE 1=1';
    const countParams = [];
    if (tenantId) {
      countSql += ' AND tenant_id = ?';
      countParams.push(tenantId);
    }
    const [countResult] = await query(countSql, countParams);
    
    res.json({ 
      success: true, 
      data: contacts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult?.total || 0
      }
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch contacts' });
  }
});

/**
 * Get single contact
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    let sql = `
      SELECT c.*, a.name as account_name, s.full_name as owner_name
      FROM contacts c
      LEFT JOIN accounts a ON c.account_id = a.id
      LEFT JOIN staff s ON c.owner_id = s.id
      WHERE c.id = ?
    `;
    const params = [req.params.id];
    
    if (tenantId) {
      sql += ' AND c.tenant_id = ?';
      params.push(tenantId);
    }
    
    const [contact] = await query(sql, params);
    
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    
    res.json({ success: true, data: contact });
  } catch (error) {
    console.error('Get contact error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch contact' });
  }
});

/**
 * Create new contact
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { first_name, last_name, email, phone, mobile, job_title, department, account_id, is_primary, owner_id } = req.body;
    
    if (!first_name) {
      return res.status(400).json({ success: false, message: 'First name is required' });
    }
    
    const result = await execute(
      `INSERT INTO contacts (tenant_id, first_name, last_name, email, phone, mobile, job_title, department, account_id, is_primary, owner_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, first_name, last_name || null, email || null, phone || null, mobile || null, 
       job_title || null, department || null, account_id || null, is_primary ? 1 : 0, owner_id || req.user.id, req.user.id]
    );
    
    // Log audit
    await execute(
      'INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?, ?)',
      [tenantId, req.user.id, 'create', 'contact', result.insertId, JSON.stringify({ first_name, last_name, email })]
    );
    
    res.json({ success: true, message: 'Contact created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ success: false, message: 'Failed to create contact' });
  }
});

/**
 * Update contact
 */
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    // Check contact exists and belongs to tenant
    let checkSql = 'SELECT id FROM contacts WHERE id = ?';
    const checkParams = [id];
    if (tenantId) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantId);
    }
    const [existing] = await query(checkSql, checkParams);
    
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    
    const fields = ['first_name', 'last_name', 'email', 'phone', 'mobile', 'job_title', 'department', 'account_id', 'is_primary', 'status', 'owner_id'];
    const updates = [];
    const params = [];
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let value = req.body[field];
        if (field === 'is_primary') value = value ? 1 : 0;
        if (['account_id', 'owner_id'].includes(field) && value === '') value = null;
        params.push(value);
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No updates provided' });
    }
    
    params.push(id);
    if (tenantId) params.push(tenantId);
    
    let updateSql = `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`;
    if (tenantId) updateSql += ' AND tenant_id = ?';
    
    await execute(updateSql, params);
    
    // Log audit
    await execute(
      'INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?, ?)',
      [tenantId, req.user.id, 'update', 'contact', id, JSON.stringify(req.body)]
    );
    
    res.json({ success: true, message: 'Contact updated' });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ success: false, message: 'Failed to update contact' });
  }
});

/**
 * Delete contact
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    let sql = 'DELETE FROM contacts WHERE id = ?';
    const params = [id];
    
    if (tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    
    const result = await execute(sql, params);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    
    // Log audit
    await execute(
      'INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
      [tenantId, req.user.id, 'delete', 'contact', id]
    );
    
    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete contact' });
  }
});

export default router;
