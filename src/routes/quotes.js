import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

async function ensureTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS quotes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      quote_number VARCHAR(50) UNIQUE NOT NULL,
      subject VARCHAR(255),
      deal_id INT,
      account_id INT,
      contact_id INT,
      valid_until DATE,
      status ENUM('draft', 'sent', 'accepted', 'rejected', 'revised') DEFAULT 'draft',
      subtotal DECIMAL(15, 2) DEFAULT 0,
      discount DECIMAL(15, 2) DEFAULT 0,
      tax DECIMAL(15, 2) DEFAULT 0,
      total DECIMAL(15, 2) DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'AED',
      notes TEXT,
      terms TEXT,
      owner_id INT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  
  await execute(`
    CREATE TABLE IF NOT EXISTS quote_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      quote_id INT NOT NULL,
      product_id INT,
      item_name VARCHAR(255) NOT NULL,
      description TEXT,
      quantity INT NOT NULL DEFAULT 1,
      unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
      discount DECIMAL(15, 2) DEFAULT 0,
      total DECIMAL(15, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { status, deal_id, account_id } = req.query;
    let sql = `
      SELECT q.*, a.name as account_name, c.first_name as contact_first_name, c.last_name as contact_last_name,
             d.name as deal_name, s.full_name as owner_name
      FROM quotes q
      LEFT JOIN accounts a ON q.account_id = a.id
      LEFT JOIN contacts c ON q.contact_id = c.id
      LEFT JOIN deals d ON q.deal_id = d.id
      LEFT JOIN staff s ON q.owner_id = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) { sql += ' AND q.status = ?'; params.push(status); }
    if (deal_id) { sql += ' AND q.deal_id = ?'; params.push(deal_id); }
    if (account_id) { sql += ' AND q.account_id = ?'; params.push(account_id); }
    sql += ' ORDER BY q.created_at DESC';
    
    const quotes = await query(sql, params);
    res.json({ success: true, data: quotes });
  } catch (error) {
    console.error('Get quotes error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quotes' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const [quote] = await query('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    if (!quote) return res.status(404).json({ success: false, message: 'Quote not found' });
    
    const items = await query('SELECT * FROM quote_items WHERE quote_id = ?', [req.params.id]);
    quote.items = items;
    
    res.json({ success: true, data: quote });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch quote' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { subject, deal_id, account_id, contact_id, valid_until, status, subtotal, discount, tax, total, currency, notes, terms, items } = req.body;
    
    // Generate quote number
    const [lastQuote] = await query('SELECT quote_number FROM quotes ORDER BY id DESC LIMIT 1');
    const lastNum = lastQuote ? parseInt(lastQuote.quote_number.replace('QT-', '')) : 0;
    const quoteNumber = `QT-${String(lastNum + 1).padStart(5, '0')}`;
    
    const result = await execute(
      `INSERT INTO quotes (quote_number, subject, deal_id, account_id, contact_id, valid_until, status, subtotal, discount, tax, total, currency, notes, terms, owner_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [quoteNumber, subject || null, deal_id || null, account_id || null, contact_id || null, valid_until || null,
       status || 'draft', subtotal || 0, discount || 0, tax || 0, total || 0, currency || 'AED', notes || null, terms || null, req.user.id, req.user.id]
    );
    
    // Add items
    if (items && items.length > 0) {
      for (const item of items) {
        await execute(
          'INSERT INTO quote_items (quote_id, product_id, item_name, description, quantity, unit_price, discount, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [result.insertId, item.product_id || null, item.item_name, item.description || null, item.quantity || 1, item.unit_price || 0, item.discount || 0, item.total || 0]
        );
      }
    }
    
    res.json({ success: true, message: 'Quote created', data: { id: result.insertId, quote_number: quoteNumber } });
  } catch (error) {
    console.error('Create quote error:', error);
    res.status(500).json({ success: false, message: 'Failed to create quote' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const fields = ['subject', 'deal_id', 'account_id', 'contact_id', 'valid_until', 'status', 'subtotal', 'discount', 'tax', 'total', 'currency', 'notes', 'terms'];
    const updates = [];
    const params = [];
    
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f] || null);
      }
    }
    
    if (updates.length > 0) {
      params.push(req.params.id);
      await execute(`UPDATE quotes SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    
    // Update items if provided
    if (req.body.items) {
      await execute('DELETE FROM quote_items WHERE quote_id = ?', [req.params.id]);
      for (const item of req.body.items) {
        await execute(
          'INSERT INTO quote_items (quote_id, product_id, item_name, description, quantity, unit_price, discount, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [req.params.id, item.product_id || null, item.item_name, item.description || null, item.quantity || 1, item.unit_price || 0, item.discount || 0, item.total || 0]
        );
      }
    }
    
    res.json({ success: true, message: 'Quote updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update quote' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await execute('DELETE FROM quote_items WHERE quote_id = ?', [req.params.id]);
    await execute('DELETE FROM quotes WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Quote deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete quote' });
  }
});

export default router;


