import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

async function ensureTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS custom_fields (
      id INT AUTO_INCREMENT PRIMARY KEY,
      entity_type ENUM('lead', 'contact', 'account', 'deal', 'activity') NOT NULL,
      field_name VARCHAR(100) NOT NULL,
      field_label VARCHAR(255) NOT NULL,
      field_label_ar VARCHAR(255),
      field_type ENUM('text', 'textarea', 'number', 'date', 'datetime', 'select', 'multiselect', 'checkbox', 'radio', 'email', 'phone', 'url', 'color', 'file') DEFAULT 'text',
      options JSON,
      default_value TEXT,
      placeholder VARCHAR(255),
      section VARCHAR(100),
      sort_order INT DEFAULT 0,
      is_required TINYINT(1) DEFAULT 0,
      is_unique TINYINT(1) DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      validation JSON,
      description TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_field (entity_type, field_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { entity_type, active } = req.query;
    let sql = 'SELECT * FROM custom_fields WHERE 1=1';
    const params = [];
    
    if (entity_type) { sql += ' AND entity_type = ?'; params.push(entity_type); }
    if (active !== undefined) { sql += ' AND is_active = ?'; params.push(active === 'true' ? 1 : 0); }
    sql += ' ORDER BY entity_type, section, sort_order, field_label';
    
    const fields = await query(sql, params);
    // Parse JSON fields
    const parsed = fields.map(f => ({
      ...f,
      options: f.options ? JSON.parse(f.options) : null,
      validation: f.validation ? JSON.parse(f.validation) : null
    }));
    
    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Get custom fields error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch custom fields' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { entity_type, field_name, field_label, field_label_ar, field_type, options, default_value, placeholder, section, sort_order, is_required, is_unique, is_active, validation, description } = req.body;
    
    if (!entity_type || !field_name || !field_label) {
      return res.status(400).json({ success: false, message: 'Entity type, field name, and label required' });
    }
    
    const result = await execute(
      `INSERT INTO custom_fields (entity_type, field_name, field_label, field_label_ar, field_type, options, default_value, placeholder, section, sort_order, is_required, is_unique, is_active, validation, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [entity_type, field_name, field_label, field_label_ar || null, field_type || 'text',
       options ? JSON.stringify(options) : null, default_value || null, placeholder || null, section || null,
       sort_order || 0, is_required ? 1 : 0, is_unique ? 1 : 0, is_active !== false ? 1 : 0,
       validation ? JSON.stringify(validation) : null, description || null, req.user.id]
    );
    res.json({ success: true, message: 'Custom field created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create custom field error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Field name already exists for this entity' });
    }
    res.status(500).json({ success: false, message: 'Failed to create custom field' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const fields = ['field_label', 'field_label_ar', 'field_type', 'options', 'default_value', 'placeholder', 'section', 'sort_order', 'is_required', 'is_unique', 'is_active', 'validation', 'description'];
    const updates = [];
    const params = [];
    
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        let value = req.body[f];
        if (f === 'is_required' || f === 'is_unique' || f === 'is_active') value = value ? 1 : 0;
        if (f === 'options' || f === 'validation') value = value ? JSON.stringify(value) : null;
        params.push(value);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, message: 'No updates' });
    
    params.push(req.params.id);
    await execute(`UPDATE custom_fields SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Custom field updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update custom field' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await execute('UPDATE custom_fields SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Custom field deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete custom field' });
  }
});

export default router;


