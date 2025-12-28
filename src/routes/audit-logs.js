import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

async function ensureTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INT NOT NULL,
      action ENUM('created', 'updated', 'deleted', 'viewed', 'exported', 'converted', 'assigned', 'status_changed') NOT NULL,
      changes JSON,
      old_values JSON,
      new_values JSON,
      ip_address VARCHAR(45),
      user_agent TEXT,
      user_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_entity (entity_type, entity_id),
      INDEX idx_user (user_id),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { entity_type, entity_id, user_id, action, limit = 100, offset = 0 } = req.query;
    
    let sql = `
      SELECT al.*, s.full_name as user_name
      FROM audit_logs al
      LEFT JOIN staff s ON al.user_id = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (entity_type) { sql += ' AND al.entity_type = ?'; params.push(entity_type); }
    if (entity_id) { sql += ' AND al.entity_id = ?'; params.push(entity_id); }
    if (user_id) { sql += ' AND al.user_id = ?'; params.push(user_id); }
    if (action) { sql += ' AND al.action = ?'; params.push(action); }
    
    sql += ` ORDER BY al.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
    
    const logs = await query(sql, params);
    
    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
    const countParams = [];
    if (entity_type) { countSql += ' AND entity_type = ?'; countParams.push(entity_type); }
    if (entity_id) { countSql += ' AND entity_id = ?'; countParams.push(entity_id); }
    if (user_id) { countSql += ' AND user_id = ?'; countParams.push(user_id); }
    if (action) { countSql += ' AND action = ?'; countParams.push(action); }
    
    const [countResult] = await query(countSql, countParams);
    
    res.json({
      success: true,
      data: logs,
      pagination: { total: countResult?.total || 0, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
  }
});

// Helper function to log an action (can be imported by other routes)
export async function logAudit(entityType, entityId, action, changes, userId, ipAddress = null) {
  try {
    await ensureTable();
    await execute(
      'INSERT INTO audit_logs (entity_type, entity_id, action, changes, user_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [entityType, entityId, action, changes ? JSON.stringify(changes) : null, userId, ipAddress]
    );
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

export default router;


