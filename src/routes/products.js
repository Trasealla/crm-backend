import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Ensure table exists
async function ensureTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      sku VARCHAR(50) UNIQUE,
      unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'AED',
      category VARCHAR(100),
      stock_quantity INT DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { category, active, search } = req.query;
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (active !== undefined) { sql += ' AND is_active = ?'; params.push(active === 'true' ? 1 : 0); }
    if (search) { sql += ' AND (name LIKE ? OR sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY name';
    
    const products = await query(sql, params);
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { name, description, sku, unit_price, currency, category, stock_quantity, is_active } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Product name required' });
    
    const result = await execute(
      'INSERT INTO products (name, description, sku, unit_price, currency, category, stock_quantity, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, description || null, sku || null, unit_price || 0, currency || 'AED', category || null, stock_quantity || 0, is_active !== false ? 1 : 0, req.user.id]
    );
    res.json({ success: true, message: 'Product created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const fields = ['name', 'description', 'sku', 'unit_price', 'currency', 'category', 'stock_quantity', 'is_active'];
    const updates = [];
    const params = [];
    
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(f === 'is_active' ? (req.body[f] ? 1 : 0) : req.body[f]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, message: 'No updates' });
    
    params.push(req.params.id);
    await execute(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Product updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await execute('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

export default router;


