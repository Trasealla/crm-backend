import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { include_stages = 'true' } = req.query;
    const tenantId = req.tenantId;
    
    // Filter by tenant_id - only show current tenant's pipelines
    const pipelines = await query(
      'SELECT * FROM pipelines WHERE is_active = 1 AND (tenant_id = ? OR tenant_id IS NULL) ORDER BY tenant_id DESC, is_default DESC, name',
      [tenantId]
    );
    
    if (include_stages === 'true') {
      for (const pipeline of pipelines) {
        const stages = await query(
          'SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY sort_order',
          [pipeline.id]
        );
        pipeline.stages = stages;
      }
    }
    
    res.json({ success: true, data: pipelines });
  } catch (error) {
    console.error('Get pipelines error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pipelines' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, industry, is_default, stages } = req.body;
    const tenantId = req.tenantId;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Pipeline name is required' });
    }
    
    // If setting as default, unset others for this tenant
    if (is_default) {
      await execute('UPDATE pipelines SET is_default = 0 WHERE tenant_id = ? AND is_default = 1', [tenantId]);
    }
    
    const result = await execute(
      'INSERT INTO pipelines (tenant_id, name, description, industry, is_default, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [tenantId, name, description || null, industry || null, is_default ? 1 : 0, req.user.id]
    );
    
    const pipelineId = result.insertId;
    
    // Create stages
    if (stages && Array.isArray(stages) && stages.length > 0) {
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        await execute(
          'INSERT INTO pipeline_stages (pipeline_id, name, color, probability, sort_order, is_won, is_lost) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [pipelineId, stage.name, stage.color || '#667eea', stage.probability || 0, i + 1, stage.is_won ? 1 : 0, stage.is_lost ? 1 : 0]
        );
      }
    } else {
      // Create default stages
      const defaultStages = [
        { name: 'New', color: '#3b82f6', probability: 10 },
        { name: 'In Progress', color: '#f59e0b', probability: 50 },
        { name: 'Won', color: '#22c55e', probability: 100, is_won: 1 },
        { name: 'Lost', color: '#6b7280', probability: 0, is_lost: 1 },
      ];
      
      for (let i = 0; i < defaultStages.length; i++) {
        const stage = defaultStages[i];
        await execute(
          'INSERT INTO pipeline_stages (pipeline_id, name, color, probability, sort_order, is_won, is_lost) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [pipelineId, stage.name, stage.color, stage.probability, i + 1, stage.is_won || 0, stage.is_lost || 0]
        );
      }
    }
    
    res.json({ success: true, message: 'Pipeline created', data: { id: pipelineId } });
  } catch (error) {
    console.error('Create pipeline error:', error);
    res.status(500).json({ success: false, message: 'Failed to create pipeline' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, industry, is_default, stages } = req.body;
    const tenantId = req.tenantId;
    
    // Verify pipeline belongs to tenant
    const [pipeline] = await query('SELECT id FROM pipelines WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (!pipeline) {
      return res.status(404).json({ success: false, message: 'Pipeline not found' });
    }
    
    const updates = [];
    const params = [];
    
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (industry !== undefined) { updates.push('industry = ?'); params.push(industry); }
    if (is_default !== undefined) {
      if (is_default) {
        await execute('UPDATE pipelines SET is_default = 0 WHERE tenant_id = ? AND is_default = 1', [tenantId]);
      }
      updates.push('is_default = ?');
      params.push(is_default ? 1 : 0);
    }
    
    if (updates.length > 0) {
      params.push(id, tenantId);
      await execute(`UPDATE pipelines SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
    }
    
    // Update stages if provided
    if (stages && Array.isArray(stages)) {
      // Delete existing stages and recreate
      await execute('DELETE FROM pipeline_stages WHERE pipeline_id = ?', [id]);
      
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        await execute(
          'INSERT INTO pipeline_stages (pipeline_id, name, color, probability, sort_order, is_won, is_lost) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, stage.name, stage.color || '#667eea', stage.probability || 0, i + 1, stage.is_won ? 1 : 0, stage.is_lost ? 1 : 0]
        );
      }
    }
    
    res.json({ success: true, message: 'Pipeline updated' });
  } catch (error) {
    console.error('Update pipeline error:', error);
    res.status(500).json({ success: false, message: 'Failed to update pipeline' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    // Verify pipeline belongs to tenant
    const [pipeline] = await query('SELECT id FROM pipelines WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (!pipeline) {
      return res.status(404).json({ success: false, message: 'Pipeline not found' });
    }
    
    // Check if pipeline has deals
    const [deals] = await query('SELECT COUNT(*) as count FROM deals WHERE pipeline_id = ? AND tenant_id = ?', [id, tenantId]);
    if (deals.count > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete pipeline with existing deals' });
    }
    
    await execute('DELETE FROM pipeline_stages WHERE pipeline_id = ?', [id]);
    await execute('DELETE FROM pipelines WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    
    res.json({ success: true, message: 'Pipeline deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete pipeline' });
  }
});

export default router;

