import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, type, status, due_date, assigned_to, overdue } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const tenantId = req.tenantId;
    
    let sql = `
      SELECT a.*, 
             s1.full_name as owner_name,
             s2.full_name as assigned_name,
             CASE 
               WHEN a.related_type = 'lead' THEN (SELECT CONCAT(first_name, ' ', COALESCE(last_name, '')) FROM leads WHERE id = a.related_id)
               WHEN a.related_type = 'contact' THEN (SELECT CONCAT(first_name, ' ', COALESCE(last_name, '')) FROM contacts WHERE id = a.related_id)
               WHEN a.related_type = 'account' THEN (SELECT name FROM accounts WHERE id = a.related_id)
               WHEN a.related_type = 'deal' THEN (SELECT name FROM deals WHERE id = a.related_id)
             END as related_name
      FROM activities a
      LEFT JOIN staff s1 ON a.owner_id = s1.id
      LEFT JOIN staff s2 ON a.assigned_to = s2.id
      WHERE a.tenant_id = ?
    `;
    const params = [tenantId];
    
    if (type) { sql += ' AND a.type = ?'; params.push(type); }
    if (status) { sql += ' AND a.status = ?'; params.push(status); }
    if (due_date) { sql += ' AND a.due_date = ?'; params.push(due_date); }
    if (assigned_to) { sql += ' AND a.assigned_to = ?'; params.push(assigned_to); }
    if (overdue === 'true') {
      sql += " AND a.due_date < CURDATE() AND a.status NOT IN ('completed', 'cancelled')";
    }
    
    sql += ` ORDER BY a.due_date ASC, a.priority DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    const activities = await query(sql, params);
    
    // Get stats (tenant-filtered)
    const [overdueCount] = await query("SELECT COUNT(*) as count FROM activities WHERE tenant_id = ? AND due_date < CURDATE() AND status NOT IN ('completed', 'cancelled')", [tenantId]);
    const [todayCount] = await query("SELECT COUNT(*) as count FROM activities WHERE tenant_id = ? AND DATE(due_date) = CURDATE()", [tenantId]);
    
    res.json({ 
      success: true, 
      data: activities,
      stats: { overdue: overdueCount?.count || 0, today: todayCount?.count || 0 }
    });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activities' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { type, subject, description, due_date, due_time, priority, status, related_type, related_id, assigned_to, reminder_datetime } = req.body;
    const tenantId = req.tenantId;
    
    if (!type || !subject) {
      return res.status(400).json({ success: false, message: 'Type and subject are required' });
    }
    
    const result = await execute(
      `INSERT INTO activities (tenant_id, type, subject, description, due_date, due_time, priority, status, related_type, related_id, owner_id, assigned_to, reminder_datetime, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, type, subject, description || null, due_date || null, due_time || null, 
       priority || 'medium', status || 'pending', related_type || null, related_id || null,
       req.user.id, assigned_to || req.user.id, reminder_datetime || null, req.user.id]
    );
    
    res.json({ success: true, message: 'Activity created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to create activity' });
  }
});

// Support both PUT and PATCH
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const fields = ['type', 'subject', 'description', 'due_date', 'due_time', 'priority', 'status', 'related_type', 'related_id', 'assigned_to', 'reminder_datetime'];
    const updates = [];
    const params = [];
    
    if (req.body.status === 'completed') {
      updates.push('completed_at = ?');
      params.push(new Date().toISOString().slice(0, 19).replace('T', ' '));
    }
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let value = req.body[field];
        if (['related_id', 'assigned_to'].includes(field) && value === '') value = null;
        if (['related_type', 'priority', 'status', 'type'].includes(field) && value === '') value = null;
        params.push(value);
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No updates provided' });
    }
    
    params.push(id, tenantId);
    await execute(`UPDATE activities SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
    
    res.json({ success: true, message: 'Activity updated' });
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to update activity: ' + error.message });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const fields = ['type', 'subject', 'description', 'due_date', 'due_time', 'priority', 'status', 'related_type', 'related_id', 'assigned_to', 'reminder_datetime'];
    const updates = [];
    const params = [];
    
    // If marking as completed, set completed_at
    if (req.body.status === 'completed') {
      updates.push('completed_at = ?');
      const now = new Date();
      params.push(now.toISOString().slice(0, 19).replace('T', ' '));
    }
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let value = req.body[field];
        // Convert empty strings to null
        if (['related_id', 'assigned_to'].includes(field) && value === '') value = null;
        if (['related_type', 'priority', 'status', 'type'].includes(field) && value === '') value = null;
        params.push(value);
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No updates provided' });
    }
    
    params.push(id, tenantId);
    await execute(`UPDATE activities SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
    
    res.json({ success: true, message: 'Activity updated' });
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to update activity: ' + error.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    await execute('DELETE FROM activities WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
    res.json({ success: true, message: 'Activity deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete activity' });
  }
});

export default router;
