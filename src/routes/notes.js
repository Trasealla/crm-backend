import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { related_type, related_id, search } = req.query;
    let sql = `SELECT n.*, s.full_name as created_by_name 
               FROM notes n 
               LEFT JOIN staff s ON n.created_by = s.id 
               WHERE 1=1`;
    const params = [];
    
    if (related_type) {
      sql += ' AND n.related_type = ?';
      params.push(related_type);
    }
    if (related_id) {
      sql += ' AND n.related_id = ?';
      params.push(related_id);
    }
    if (search) {
      sql += ' AND (n.title LIKE ? OR n.content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY n.is_pinned DESC, n.updated_at DESC';
    
    const notes = await query(sql, params);
    res.json({ success: true, data: notes });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notes' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, content, related_type, related_id, is_private, is_pinned } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'Content required' });
    
    const result = await execute(
      `INSERT INTO notes (title, content, related_type, related_id, is_private, is_pinned, created_by, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        title || null, 
        content, 
        related_type || null, 
        related_id || null, 
        is_private ? 1 : 0, 
        is_pinned ? 1 : 0,
        req.user.id
      ]
    );
    res.json({ success: true, message: 'Note created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ success: false, message: 'Failed to create note' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, content, related_type, related_id, is_private, is_pinned } = req.body;
    await execute(
      `UPDATE notes SET 
        title = ?, 
        content = ?, 
        related_type = ?,
        related_id = ?,
        is_private = ?, 
        is_pinned = ?,
        updated_at = NOW()
       WHERE id = ?`, 
      [
        title || null,
        content, 
        related_type || null,
        related_id || null,
        is_private ? 1 : 0, 
        is_pinned ? 1 : 0,
        req.params.id
      ]
    );
    res.json({ success: true, message: 'Note updated' });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ success: false, message: 'Failed to update note' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await execute('DELETE FROM notes WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete note' });
  }
});

export default router;
