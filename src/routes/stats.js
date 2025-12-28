import express from 'express';
import { query } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const tenantFilter = tenantId ? ' AND tenant_id = ?' : '';
    const tenantParams = tenantId ? [tenantId] : [];
    
    // Leads
    const [leadsTotal] = await query(`SELECT COUNT(*) as count FROM leads WHERE 1=1${tenantFilter}`, tenantParams);
    const [leadsNew] = await query(`SELECT COUNT(*) as count FROM leads WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)${tenantFilter}`, tenantParams);
    const [leadsConverted] = await query(`SELECT COUNT(*) as count FROM leads WHERE status = 'converted'${tenantFilter}`, tenantParams);
    
    // Deals
    const [dealsTotal] = await query(`SELECT COUNT(*) as count FROM deals WHERE 1=1${tenantFilter}`, tenantParams);
    const [dealsOpen] = await query(`SELECT COUNT(*) as count FROM deals WHERE status = 'open'${tenantFilter}`, tenantParams);
    const [dealsWon] = await query(`SELECT COUNT(*) as count FROM deals WHERE status = 'won'${tenantFilter}`, tenantParams);
    const [dealsLost] = await query(`SELECT COUNT(*) as count FROM deals WHERE status = 'lost'${tenantFilter}`, tenantParams);
    const [pipelineValue] = await query(`SELECT COALESCE(SUM(amount), 0) as value FROM deals WHERE status = 'open'${tenantFilter}`, tenantParams);
    const [wonValue] = await query(`SELECT COALESCE(SUM(amount), 0) as value FROM deals WHERE status = 'won'${tenantFilter}`, tenantParams);
    
    // Accounts
    const [accountsTotal] = await query(`SELECT COUNT(*) as count FROM accounts WHERE 1=1${tenantFilter}`, tenantParams);
    
    // Contacts
    const [contactsTotal] = await query(`SELECT COUNT(*) as count FROM contacts WHERE 1=1${tenantFilter}`, tenantParams);
    
    // Activities
    const [activitiesOverdue] = await query(`SELECT COUNT(*) as count FROM activities WHERE due_date < CURDATE() AND status NOT IN ('completed', 'cancelled')${tenantFilter}`, tenantParams);
    const [activitiesToday] = await query(`SELECT COUNT(*) as count FROM activities WHERE DATE(due_date) = CURDATE()${tenantFilter}`, tenantParams);
    const [activitiesUpcoming] = await query(`SELECT COUNT(*) as count FROM activities WHERE due_date > CURDATE() AND due_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) AND status NOT IN ('completed', 'cancelled')${tenantFilter}`, tenantParams);
    
    // Pipeline stages with deal counts (for the current tenant's default pipeline)
    let pipelineStages = [];
    let pipelineName = null;
    if (tenantId) {
      // Get the default pipeline for this tenant
      const [defaultPipeline] = await query(
        `SELECT id, name FROM pipelines WHERE tenant_id = ? AND is_default = 1 LIMIT 1`,
        [tenantId]
      );
      
      if (defaultPipeline) {
        pipelineName = defaultPipeline.name;
        pipelineStages = await query(
          `SELECT ps.id, ps.name, ps.color, ps.sort_order, 
                  COUNT(d.id) as deal_count,
                  COALESCE(SUM(d.amount), 0) as total_value
           FROM pipeline_stages ps
           LEFT JOIN deals d ON d.stage_id = ps.id AND d.tenant_id = ? AND d.status = 'open'
           WHERE ps.pipeline_id = ?
           GROUP BY ps.id, ps.name, ps.color, ps.sort_order
           ORDER BY ps.sort_order`,
          [tenantId, defaultPipeline.id]
        );
      }
    }
    
    // Monthly revenue (from won deals, grouped by month - using updated_at as close date)
    let monthlyRevenueSql = `
      SELECT 
        MONTH(updated_at) as month,
        COALESCE(SUM(amount), 0) as revenue
      FROM deals 
      WHERE status = 'won' 
        AND YEAR(updated_at) = YEAR(CURDATE())
    `;
    if (tenantId) {
      monthlyRevenueSql += ' AND tenant_id = ?';
    }
    monthlyRevenueSql += ' GROUP BY MONTH(updated_at) ORDER BY month';
    
    const monthlyRevenueData = await query(monthlyRevenueSql, tenantParams);
    
    // Convert to array of 12 months
    const monthlyRevenue = Array(12).fill(0);
    monthlyRevenueData.forEach(row => {
      if (row.month >= 1 && row.month <= 12) {
        monthlyRevenue[row.month - 1] = parseFloat(row.revenue) || 0;
      }
    });
    
    // Lead sources with counts
    let leadSourcesSql = `
      SELECT source, COUNT(*) as count 
      FROM leads 
      WHERE source IS NOT NULL AND source != ''
    `;
    if (tenantId) {
      leadSourcesSql += ' AND tenant_id = ?';
    }
    leadSourcesSql += ' GROUP BY source ORDER BY count DESC';
    
    const leadSourcesData = await query(leadSourcesSql, tenantParams);
    
    // Convert to object
    const leadSources = {};
    leadSourcesData.forEach(row => {
      leadSources[row.source] = row.count;
    });
    
    // Recent deals (with tenant filter)
    let recentDealsSql = `
      SELECT d.id, d.name, d.amount, d.status, ps.name as stage_name, ps.color as stage_color, a.name as account_name
      FROM deals d
      LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id
      LEFT JOIN accounts a ON d.account_id = a.id
      WHERE 1=1
    `;
    if (tenantId) {
      recentDealsSql += ' AND d.tenant_id = ?';
    }
    recentDealsSql += ' ORDER BY d.updated_at DESC LIMIT 5';
    const recentDeals = await query(recentDealsSql, tenantParams);
    
    // Recent leads (with tenant filter)
    let recentLeadsSql = `
      SELECT id, first_name, last_name, company, status, rating, source, created_at
      FROM leads WHERE 1=1
    `;
    if (tenantId) {
      recentLeadsSql += ' AND tenant_id = ?';
    }
    recentLeadsSql += ' ORDER BY created_at DESC LIMIT 5';
    const recentLeads = await query(recentLeadsSql, tenantParams);
    
    res.json({
      success: true,
      data: {
        leads: {
          total: leadsTotal?.count || 0,
          new: leadsNew?.count || 0,
          converted: leadsConverted?.count || 0,
        },
        deals: {
          total: dealsTotal?.count || 0,
          open: dealsOpen?.count || 0,
          won: dealsWon?.count || 0,
          lost: dealsLost?.count || 0,
          pipelineValue: parseFloat(pipelineValue?.value) || 0,
          wonValue: parseFloat(wonValue?.value) || 0,
        },
        accounts: {
          total: accountsTotal?.count || 0,
        },
        contacts: {
          total: contactsTotal?.count || 0,
        },
        activities: {
          overdue: activitiesOverdue?.count || 0,
          today: activitiesToday?.count || 0,
          upcoming: activitiesUpcoming?.count || 0,
        },
        pipeline: {
          name: pipelineName,
        },
        pipelineStages,
        monthlyRevenue,
        leadSources,
        recentDeals,
        recentLeads,
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

export default router;
