import express from 'express';
import bcrypt from 'bcryptjs';
import { query, execute } from '../lib/database.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Get all staff
router.get('/', authMiddleware, async (req, res) => {
  try {
    const staff = await query(
      'SELECT id, username, email, full_name, phone, role, is_active, last_login, created_at FROM staff ORDER BY created_at DESC'
    );
    res.json({ success: true, data: staff });
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch staff' });
  }
});

// Create staff (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { username, email, password, full_name, phone, role } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await execute(
      'INSERT INTO staff (username, email, password, full_name, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email || null, hashedPassword, full_name || null, phone || null, role || 'staff']
    );
    
    res.json({ success: true, message: 'Staff created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create staff error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Username or email already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create staff' });
  }
});

// Update staff
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone, role, is_active, password } = req.body;
    
    // Only admin can change role or active status
    if ((role || is_active !== undefined) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    const updates = [];
    const params = [];
    
    if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email || null); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone || null); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      params.push(hashedPassword);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No updates provided' });
    }
    
    params.push(id);
    await execute(`UPDATE staff SET ${updates.join(', ')} WHERE id = ?`, params);
    
    res.json({ success: true, message: 'Staff updated' });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ success: false, message: 'Failed to update staff' });
  }
});

// Delete staff (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent self-delete
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete yourself' });
    }
    
    await execute('DELETE FROM staff WHERE id = ?', [id]);
    res.json({ success: true, message: 'Staff deleted' });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete staff' });
  }
});

export default router;


