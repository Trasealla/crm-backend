import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { entity_type } = req.query;
    let sql = 'SELECT * FROM tags WHERE 1=1';
    const params = [];
    if (entity_type) { sql += ' AND entity_type = ?'; params.push(entity_type); }
    sql += ' ORDER BY name';
    
    const tags = await query(sql, params);
    res.json({ success: true, data: tags });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch tags' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, color, entity_type } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    
    const result = await execute(
      'INSERT INTO tags (name, color, entity_type) VALUES (?, ?, ?)',
      [name, color || '#667eea', entity_type || null]
    );
    res.json({ success: true, message: 'Tag created', data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create tag' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, color, entity_type } = req.body;
    await execute('UPDATE tags SET name = ?, color = ?, entity_type = ? WHERE id = ?',
      [name, color, entity_type, req.params.id]);
    res.json({ success: true, message: 'Tag updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update tag' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await execute('DELETE FROM tags WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Tag deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete tag' });
  }
});

export default router;


