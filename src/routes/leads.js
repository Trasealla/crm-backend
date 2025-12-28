import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * Get all leads for the current tenant
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, source, rating, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const tenantId = req.tenantId;
    
    let sql = `
      SELECT l.*, s.full_name as owner_name
      FROM leads l
      LEFT JOIN staff s ON l.owner_id = s.id
      WHERE 1=1
    `;
    const params = [];
    
    // Filter by tenant
    if (tenantId) {
      sql += ' AND l.tenant_id = ?';
      params.push(tenantId);
    }
    
    if (status) { sql += ' AND l.status = ?'; params.push(status); }
    if (source) { sql += ' AND l.source = ?'; params.push(source); }
    if (rating) { sql += ' AND l.rating = ?'; params.push(rating); }
    if (search) { 
      sql += ' AND (l.first_name LIKE ? OR l.last_name LIKE ? OR l.email LIKE ? OR l.company LIKE ?)'; 
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); 
    }
    
    sql += ` ORDER BY l.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    const leads = await query(sql, params);
    
    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM leads WHERE 1=1';
    const countParams = [];
    if (tenantId) {
      countSql += ' AND tenant_id = ?';
      countParams.push(tenantId);
    }
    const [countResult] = await query(countSql, countParams);
    
    res.json({ 
      success: true, 
      data: leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult?.total || 0
      }
    });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leads' });
  }
});

/**
 * Get single lead
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    let sql = `
      SELECT l.*, s.full_name as owner_name
      FROM leads l
      LEFT JOIN staff s ON l.owner_id = s.id
      WHERE l.id = ?
    `;
    const params = [req.params.id];
    
    if (tenantId) {
      sql += ' AND l.tenant_id = ?';
      params.push(tenantId);
    }
    
    const [lead] = await query(sql, params);
    
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    
    res.json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch lead' });
  }
});

/**
 * Create new lead
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { 
      first_name, last_name, company, job_title, email, phone, mobile, whatsapp,
      website, industry, source, status, rating, score, address, city, country, notes, owner_id 
    } = req.body;
    
    if (!first_name) {
      return res.status(400).json({ success: false, message: 'First name is required' });
    }
    
    const result = await execute(
      `INSERT INTO leads (tenant_id, first_name, last_name, company, job_title, email, phone, mobile, whatsapp,
        website, industry, source, status, rating, score, address, city, country, notes, owner_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, first_name, last_name || null, company || null, job_title || null, email || null, 
       phone || null, mobile || null, whatsapp || null, website || null, industry || null, 
       source || null, status || 'new', rating || 'warm', score || 0,
       address || null, city || null, country || null, notes || null, owner_id || req.user.id, req.user.id]
    );
    
    // Log audit
    await execute(
      'INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?, ?)',
      [tenantId, req.user.id, 'create', 'lead', result.insertId, JSON.stringify({ first_name, company, email })]
    );
    
    res.json({ success: true, message: 'Lead created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({ success: false, message: 'Failed to create lead' });
  }
});

/**
 * Update lead
 */
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    // Check lead exists and belongs to tenant
    let checkSql = 'SELECT id FROM leads WHERE id = ?';
    const checkParams = [id];
    if (tenantId) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantId);
    }
    const [existing] = await query(checkSql, checkParams);
    
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    
    const fields = ['first_name', 'last_name', 'company', 'job_title', 'email', 'phone', 'mobile', 'whatsapp',
      'website', 'industry', 'source', 'status', 'rating', 'score', 'address', 'city', 'country', 'notes', 'owner_id'];
    const updates = [];
    const params = [];
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let value = req.body[field];
        if (['owner_id', 'score'].includes(field) && value === '') value = null;
        params.push(value);
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No updates provided' });
    }
    
    params.push(id);
    if (tenantId) params.push(tenantId);
    
    let updateSql = `UPDATE leads SET ${updates.join(', ')} WHERE id = ?`;
    if (tenantId) updateSql += ' AND tenant_id = ?';
    
    await execute(updateSql, params);
    
    // Log audit
    await execute(
      'INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?, ?)',
      [tenantId, req.user.id, 'update', 'lead', id, JSON.stringify(req.body)]
    );
    
    res.json({ success: true, message: 'Lead updated' });
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ success: false, message: 'Failed to update lead' });
  }
});

/**
 * Convert lead to account/contact/deal
 */
router.post('/:id/convert', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const { create_account = true, create_contact = true, create_deal = false, deal_name, deal_amount, pipeline_id, stage_id } = req.body;
    
    // Get the lead
    let sql = 'SELECT * FROM leads WHERE id = ?';
    const params = [id];
    if (tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    const [lead] = await query(sql, params);
    
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    
    if (lead.status === 'converted') {
      return res.status(400).json({ success: false, message: 'Lead already converted' });
    }
    
    let accountId = null;
    let contactId = null;
    let dealId = null;
    
    // Create account
    if (create_account && lead.company) {
      const accountResult = await execute(
        `INSERT INTO accounts (tenant_id, name, industry, website, phone, email, address, city, country, owner_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, lead.company, lead.industry, lead.website, lead.phone, lead.email, 
         lead.address, lead.city, lead.country, lead.owner_id || req.user.id, req.user.id]
      );
      accountId = accountResult.insertId;
    }
    
    // Create contact
    if (create_contact) {
      const contactResult = await execute(
        `INSERT INTO contacts (tenant_id, account_id, first_name, last_name, email, phone, mobile, job_title, owner_id, created_by, is_primary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, accountId, lead.first_name, lead.last_name, lead.email, lead.phone, 
         lead.mobile, lead.job_title, lead.owner_id || req.user.id, req.user.id, 1]
      );
      contactId = contactResult.insertId;
    }
    
    // Create deal
    if (create_deal) {
      const dealResult = await execute(
        `INSERT INTO deals (tenant_id, name, account_id, contact_id, lead_id, pipeline_id, stage_id, amount, owner_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, deal_name || `${lead.first_name} ${lead.last_name || ''} - Deal`, accountId, contactId, id,
         pipeline_id || null, stage_id || null, deal_amount || null, lead.owner_id || req.user.id, req.user.id]
      );
      dealId = dealResult.insertId;
    }
    
    // Update lead status
    await execute(
      `UPDATE leads SET status = 'converted', converted_at = NOW(), 
       converted_account_id = ?, converted_contact_id = ?, converted_deal_id = ? WHERE id = ?`,
      [accountId, contactId, dealId, id]
    );
    
    // Log audit
    await execute(
      'INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?, ?)',
      [tenantId, req.user.id, 'convert', 'lead', id, JSON.stringify({ accountId, contactId, dealId })]
    );
    
    res.json({ 
      success: true, 
      message: 'Lead converted successfully',
      data: { account_id: accountId, contact_id: contactId, deal_id: dealId }
    });
  } catch (error) {
    console.error('Convert lead error:', error);
    res.status(500).json({ success: false, message: 'Failed to convert lead' });
  }
});

/**
 * Delete lead
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    let sql = 'DELETE FROM leads WHERE id = ?';
    const params = [id];
    
    if (tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    
    const result = await execute(sql, params);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    
    // Log audit
    await execute(
      'INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
      [tenantId, req.user.id, 'delete', 'lead', id]
    );
    
    res.json({ success: true, message: 'Lead deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete lead' });
  }
});

export default router;
