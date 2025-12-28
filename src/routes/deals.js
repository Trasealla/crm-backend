import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 100, status, pipeline_id, stage_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const tenantId = req.tenantId;
    
    let sql = `
      SELECT d.*, 
             a.name as account_name, 
             c.first_name as contact_first_name, c.last_name as contact_last_name,
             s.full_name as owner_name,
             ps.name as stage_name, ps.color as stage_color, ps.is_won, ps.is_lost
      FROM deals d
      LEFT JOIN accounts a ON d.account_id = a.id
      LEFT JOIN contacts c ON d.contact_id = c.id
      LEFT JOIN staff s ON d.owner_id = s.id
      LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id
      WHERE d.tenant_id = ?
    `;
    const params = [tenantId];
    
    if (status) { sql += ' AND d.status = ?'; params.push(status); }
    if (pipeline_id) { sql += ' AND d.pipeline_id = ?'; params.push(pipeline_id); }
    if (stage_id) { sql += ' AND d.stage_id = ?'; params.push(stage_id); }
    
    sql += ` ORDER BY d.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    const deals = await query(sql, params);
    
    // Fetch pipelines with stages (tenant-filtered)
    const pipelines = await query(
      'SELECT * FROM pipelines WHERE is_active = 1 AND (tenant_id = ? OR tenant_id IS NULL) ORDER BY tenant_id DESC, is_default DESC, name ASC',
      [tenantId]
    );
    for (const pipeline of pipelines) {
      const stages = await query('SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY sort_order ASC', [pipeline.id]);
      pipeline.stages = stages;
    }
    
    // Calculate stats (tenant-filtered)
    const [openResult] = await query("SELECT COUNT(*) as count FROM deals WHERE status = 'open' AND tenant_id = ?", [tenantId]);
    const [pipelineValue] = await query("SELECT COALESCE(SUM(amount), 0) as total FROM deals WHERE status = 'open' AND tenant_id = ?", [tenantId]);
    const [weightedValue] = await query("SELECT COALESCE(SUM(amount * probability / 100), 0) as total FROM deals WHERE status = 'open' AND tenant_id = ?", [tenantId]);
    const [wonValue] = await query("SELECT COALESCE(SUM(amount), 0) as total FROM deals WHERE status = 'won' AND tenant_id = ?", [tenantId]);
    
    const stats = {
      open_deals: openResult?.count || 0,
      pipeline_value: pipelineValue?.total || 0,
      weighted_value: weightedValue?.total || 0,
      won_value: wonValue?.total || 0
    };
    
    res.json({ success: true, data: deals, pipelines, stats });
  } catch (error) {
    console.error('Get deals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch deals' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, account_id, contact_id, lead_id, pipeline_id, stage_id, amount, currency, probability, expected_close_date, description, owner_id } = req.body;
    const tenantId = req.tenantId;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Deal name is required' });
    }
    
    // Get probability from stage if not provided
    let dealProbability = probability;
    if (!probability && stage_id) {
      const [stage] = await query('SELECT probability FROM pipeline_stages WHERE id = ?', [stage_id]);
      dealProbability = stage?.probability || 0;
    }
    
    const result = await execute(
      `INSERT INTO deals (tenant_id, name, account_id, contact_id, lead_id, pipeline_id, stage_id, amount, currency, probability, expected_close_date, description, owner_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, name, account_id || null, contact_id || null, lead_id || null, pipeline_id || null, stage_id || null,
       amount || 0, currency || 'AED', dealProbability || 0, expected_close_date || null, description || null, 
       owner_id || req.user.id, req.user.id]
    );
    
    res.json({ success: true, message: 'Deal created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create deal error:', error);
    res.status(500).json({ success: false, message: 'Failed to create deal' });
  }
});

// Support both PUT and PATCH
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const fields = ['name', 'account_id', 'contact_id', 'pipeline_id', 'stage_id', 'amount', 'currency', 'probability', 'expected_close_date', 'status', 'description', 'owner_id'];
    const updates = [];
    const params = [];
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let value = req.body[field];
        if (['account_id', 'contact_id', 'pipeline_id', 'stage_id', 'owner_id', 'amount', 'probability'].includes(field) && value === '') value = null;
        params.push(value);
      }
    }
    
    // If stage changed, update probability from stage
    if (req.body.stage_id && !req.body.probability) {
      const [stage] = await query('SELECT probability, is_won, is_lost FROM pipeline_stages WHERE id = ?', [req.body.stage_id]);
      if (stage) {
        updates.push('probability = ?');
        params.push(stage.probability);
        
        // Update status based on stage
        if (stage.is_won) {
          updates.push("status = 'won'");
        } else if (stage.is_lost) {
          updates.push("status = 'lost'");
        } else {
          updates.push("status = 'open'");
        }
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No updates provided' });
    }
    
    params.push(id, tenantId);
    await execute(`UPDATE deals SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
    
    res.json({ success: true, message: 'Deal updated' });
  } catch (error) {
    console.error('Update deal error:', error);
    res.status(500).json({ success: false, message: 'Failed to update deal' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const fields = ['name', 'account_id', 'contact_id', 'pipeline_id', 'stage_id', 'amount', 'currency', 'probability', 'expected_close_date', 'status', 'description', 'owner_id'];
    const updates = [];
    const params = [];
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let value = req.body[field];
        if (['account_id', 'contact_id', 'pipeline_id', 'stage_id', 'owner_id', 'amount', 'probability'].includes(field) && value === '') value = null;
        params.push(value);
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No updates provided' });
    }
    
    params.push(id, tenantId);
    await execute(`UPDATE deals SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
    
    res.json({ success: true, message: 'Deal updated' });
  } catch (error) {
    console.error('Update deal error:', error);
    res.status(500).json({ success: false, message: 'Failed to update deal' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    await execute('DELETE FROM deals WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
    res.json({ success: true, message: 'Deal deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete deal' });
  }
});

export default router;
