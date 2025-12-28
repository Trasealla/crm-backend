import express from 'express';
import { query } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { type = 'overview', period = '30' } = req.query;
    const days = parseInt(period);
    
    let data = {};
    
    if (type === 'overview' || type === 'all') {
      // Lead stats
      const [leadsTotal] = await query('SELECT COUNT(*) as count FROM leads');
      const [leadsNew] = await query(`SELECT COUNT(*) as count FROM leads WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
      const [leadsConverted] = await query(`SELECT COUNT(*) as count FROM leads WHERE status = 'converted' AND created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
      
      // Deal stats  
      const [dealsTotal] = await query('SELECT COUNT(*) as count FROM deals');
      const [dealsWon] = await query(`SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as value FROM deals WHERE status = 'won' AND created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
      const [pipelineValue] = await query(`SELECT COALESCE(SUM(amount), 0) as value FROM deals WHERE status = 'open'`);
      
      // Activity stats
      const [activitiesCompleted] = await query(`SELECT COUNT(*) as count FROM activities WHERE status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
      const [activitiesOverdue] = await query(`SELECT COUNT(*) as count FROM activities WHERE due_date < CURDATE() AND status NOT IN ('completed', 'cancelled')`);
      
      data.overview = {
        leads: { total: leadsTotal?.count || 0, new: leadsNew?.count || 0, converted: leadsConverted?.count || 0 },
        deals: { total: dealsTotal?.count || 0, won: dealsWon?.count || 0, wonValue: parseFloat(dealsWon?.value) || 0, pipelineValue: parseFloat(pipelineValue?.value) || 0 },
        activities: { completed: activitiesCompleted?.count || 0, overdue: activitiesOverdue?.count || 0 }
      };
    }
    
    if (type === 'sales' || type === 'all') {
      // Sales by month
      const salesByMonth = await query(`
        SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as deals, COALESCE(SUM(amount), 0) as revenue
        FROM deals WHERE status = 'won' AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY month ORDER BY month
      `);
      
      // Sales by stage
      const salesByStage = await query(`
        SELECT ps.name, ps.color, COUNT(d.id) as count, COALESCE(SUM(d.amount), 0) as value
        FROM pipeline_stages ps LEFT JOIN deals d ON d.stage_id = ps.id
        GROUP BY ps.id, ps.name, ps.color ORDER BY ps.sort_order
      `);
      
      data.sales = { byMonth: salesByMonth, byStage: salesByStage };
    }
    
    if (type === 'leads' || type === 'all') {
      // Leads by source
      const leadsBySource = await query(`
        SELECT COALESCE(source, 'Unknown') as source, COUNT(*) as count
        FROM leads GROUP BY source ORDER BY count DESC
      `);
      
      // Leads by status
      const leadsByStatus = await query(`
        SELECT status, COUNT(*) as count FROM leads GROUP BY status
      `);
      
      data.leads = { bySource: leadsBySource, byStatus: leadsByStatus };
    }
    
    if (type === 'performance' || type === 'all') {
      // Top performers
      const topPerformers = await query(`
        SELECT s.full_name, s.id, 
          (SELECT COUNT(*) FROM deals WHERE owner_id = s.id AND status = 'won') as deals_won,
          (SELECT COALESCE(SUM(amount), 0) FROM deals WHERE owner_id = s.id AND status = 'won') as revenue
        FROM staff s WHERE s.is_active = 1
        ORDER BY revenue DESC LIMIT 10
      `);
      
      data.performance = { topPerformers };
    }
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Reports error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
});

export default router;


