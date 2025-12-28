import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

async function ensureTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS audiences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      type ENUM('static', 'dynamic') DEFAULT 'static',
      criteria JSON,
      member_count INT DEFAULT 0,
      tags JSON,
      is_active TINYINT(1) DEFAULT 1,
      last_synced_at DATETIME,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS audience_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      audience_id INT NOT NULL,
      contact_id INT,
      lead_id INT,
      email VARCHAR(255),
      phone VARCHAR(50),
      status ENUM('active', 'unsubscribed', 'bounced') DEFAULT 'active',
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audience (audience_id),
      INDEX idx_contact (contact_id),
      INDEX idx_lead (lead_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// Get all audiences
router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { type, active } = req.query;
    let sql = `
      SELECT a.*, s.full_name as created_by_name,
        (SELECT COUNT(*) FROM audience_members WHERE audience_id = a.id AND status = 'active') as active_count
      FROM audiences a
      LEFT JOIN staff s ON a.created_by = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (type) { sql += ' AND a.type = ?'; params.push(type); }
    if (active !== undefined) { sql += ' AND a.is_active = ?'; params.push(active === 'true' ? 1 : 0); }
    sql += ' ORDER BY a.name';
    
    const audiences = await query(sql, params);
    res.json({ success: true, data: audiences });
  } catch (error) {
    console.error('Fetch audiences error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch audiences' });
  }
});

// Get audience with members
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const [audience] = await query('SELECT * FROM audiences WHERE id = ?', [req.params.id]);
    if (!audience) {
      return res.status(404).json({ success: false, message: 'Audience not found' });
    }
    
    const members = await query(
      `SELECT am.*, c.first_name, c.last_name, c.email as contact_email,
              l.first_name as lead_first_name, l.last_name as lead_last_name, l.email as lead_email
       FROM audience_members am
       LEFT JOIN contacts c ON am.contact_id = c.id
       LEFT JOIN leads l ON am.lead_id = l.id
       WHERE am.audience_id = ?
       ORDER BY am.added_at DESC
       LIMIT 100`,
      [req.params.id]
    );
    
    res.json({ success: true, data: { ...audience, members } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch audience' });
  }
});

// Create audience
router.post('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { name, description, type, criteria, tags } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Audience name required' });
    }
    
    const result = await execute(
      'INSERT INTO audiences (name, description, type, criteria, tags, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description || null, type || 'static', 
       criteria ? JSON.stringify(criteria) : null, 
       tags ? JSON.stringify(tags) : null, 
       req.user.id]
    );
    res.json({ success: true, message: 'Audience created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create audience error:', error);
    res.status(500).json({ success: false, message: 'Failed to create audience' });
  }
});

// Update audience
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const fields = ['name', 'description', 'type', 'criteria', 'tags', 'is_active'];
    const updates = [];
    const params = [];
    
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        let value = req.body[f];
        if (f === 'is_active') value = value ? 1 : 0;
        if (f === 'criteria' || f === 'tags') value = value ? JSON.stringify(value) : null;
        params.push(value);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, message: 'No updates' });
    
    params.push(req.params.id);
    await execute(`UPDATE audiences SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Audience updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update audience' });
  }
});

// Add members to audience
router.post('/:id/members', authMiddleware, async (req, res) => {
  try {
    const { members } = req.body; // Array of { contact_id, lead_id, email, phone }
    
    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ success: false, message: 'Members array required' });
    }
    
    let added = 0;
    for (const member of members) {
      try {
        await execute(
          'INSERT INTO audience_members (audience_id, contact_id, lead_id, email, phone) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, member.contact_id || null, member.lead_id || null, member.email || null, member.phone || null]
        );
        added++;
      } catch (e) {
        // Skip duplicates
      }
    }
    
    // Update member count
    await execute(
      'UPDATE audiences SET member_count = (SELECT COUNT(*) FROM audience_members WHERE audience_id = ?) WHERE id = ?',
      [req.params.id, req.params.id]
    );
    
    res.json({ success: true, message: `${added} members added`, data: { added } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add members' });
  }
});

// Remove member from audience
router.delete('/:id/members/:memberId', authMiddleware, async (req, res) => {
  try {
    await execute('DELETE FROM audience_members WHERE id = ? AND audience_id = ?', [req.params.memberId, req.params.id]);
    
    // Update member count
    await execute(
      'UPDATE audiences SET member_count = (SELECT COUNT(*) FROM audience_members WHERE audience_id = ?) WHERE id = ?',
      [req.params.id, req.params.id]
    );
    
    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove member' });
  }
});

// Sync dynamic audience
router.post('/:id/sync', authMiddleware, async (req, res) => {
  try {
    const [audience] = await query('SELECT * FROM audiences WHERE id = ?', [req.params.id]);
    if (!audience) {
      return res.status(404).json({ success: false, message: 'Audience not found' });
    }
    
    if (audience.type !== 'dynamic') {
      return res.status(400).json({ success: false, message: 'Only dynamic audiences can be synced' });
    }
    
    // Parse criteria and build query (simplified example)
    const criteria = audience.criteria ? JSON.parse(audience.criteria) : {};
    let syncCount = 0;
    
    // Example: sync leads matching criteria
    if (criteria.source) {
      const leads = await query('SELECT id, email, phone FROM leads WHERE source = ?', [criteria.source]);
      for (const lead of leads) {
        try {
          await execute(
            'INSERT IGNORE INTO audience_members (audience_id, lead_id, email, phone) VALUES (?, ?, ?, ?)',
            [req.params.id, lead.id, lead.email, lead.phone]
          );
          syncCount++;
        } catch (e) {}
      }
    }
    
    // Update member count and sync time
    await execute(
      'UPDATE audiences SET member_count = (SELECT COUNT(*) FROM audience_members WHERE audience_id = ?), last_synced_at = NOW() WHERE id = ?',
      [req.params.id, req.params.id]
    );
    
    res.json({ success: true, message: `Audience synced: ${syncCount} members added` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to sync audience' });
  }
});

// Delete audience
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await execute('DELETE FROM audience_members WHERE audience_id = ?', [req.params.id]);
    await execute('DELETE FROM audiences WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Audience deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete audience' });
  }
});

export default router;


