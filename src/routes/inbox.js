import express from 'express';
import { query, execute } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

async function ensureTables() {
  await execute(`
    CREATE TABLE IF NOT EXISTS inbox_channels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      channel_type ENUM('email', 'whatsapp', 'sms', 'live_chat', 'facebook', 'instagram', 'twitter') NOT NULL,
      name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255),
      icon VARCHAR(50),
      color VARCHAR(20),
      config JSON,
      is_enabled TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  
  await execute(`
    CREATE TABLE IF NOT EXISTS inbox_conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      channel_id INT,
      customer_identifier VARCHAR(255) NOT NULL,
      customer_name VARCHAR(255),
      customer_email VARCHAR(255),
      customer_phone VARCHAR(50),
      contact_id INT,
      lead_id INT,
      account_id INT,
      status ENUM('open', 'pending', 'resolved', 'closed') DEFAULT 'open',
      priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
      assigned_to INT,
      is_starred TINYINT(1) DEFAULT 0,
      last_message_at TIMESTAMP NULL,
      first_response_at TIMESTAMP NULL,
      resolved_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  
  await execute(`
    CREATE TABLE IF NOT EXISTS inbox_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      sender_type ENUM('customer', 'agent', 'system') NOT NULL,
      sender_id INT,
      sender_name VARCHAR(255),
      content TEXT,
      content_type ENUM('text', 'html', 'image', 'file', 'audio', 'video') DEFAULT 'text',
      attachments JSON,
      is_private TINYINT(1) DEFAULT 0,
      is_read TINYINT(1) DEFAULT 0,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  
  await execute(`
    CREATE TABLE IF NOT EXISTS inbox_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      category VARCHAR(100),
      shortcut VARCHAR(50),
      is_active TINYINT(1) DEFAULT 1,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// Get conversations
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    await ensureTables();
    const { status, channel_id, assigned_to, starred } = req.query;
    
    let sql = `
      SELECT c.*, ch.channel_type, ch.display_name as channel_name, ch.icon as channel_icon, ch.color as channel_color,
             s.full_name as assigned_name,
             (SELECT COUNT(*) FROM inbox_messages WHERE conversation_id = c.id AND is_read = 0 AND sender_type = 'customer') as unread_count,
             (SELECT content FROM inbox_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM inbox_conversations c
      LEFT JOIN inbox_channels ch ON c.channel_id = ch.id
      LEFT JOIN staff s ON c.assigned_to = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) { sql += ' AND c.status = ?'; params.push(status); }
    if (channel_id) { sql += ' AND c.channel_id = ?'; params.push(channel_id); }
    if (assigned_to) { sql += ' AND c.assigned_to = ?'; params.push(assigned_to); }
    if (starred === 'true') { sql += ' AND c.is_starred = 1'; }
    
    sql += ' ORDER BY c.last_message_at DESC, c.created_at DESC';
    
    const conversations = await query(sql, params);
    res.json({ success: true, data: conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
});

// Get single conversation with messages
router.get('/conversations/:id', authMiddleware, async (req, res) => {
  try {
    await ensureTables();
    const [conversation] = await query(`
      SELECT c.*, ch.channel_type, ch.display_name as channel_name
      FROM inbox_conversations c
      LEFT JOIN inbox_channels ch ON c.channel_id = ch.id
      WHERE c.id = ?
    `, [req.params.id]);
    
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    
    const messages = await query(`
      SELECT m.*, s.full_name as agent_name
      FROM inbox_messages m
      LEFT JOIN staff s ON m.sender_id = s.id AND m.sender_type = 'agent'
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `, [req.params.id]);
    
    // Mark messages as read
    await execute('UPDATE inbox_messages SET is_read = 1, read_at = NOW() WHERE conversation_id = ? AND sender_type = "customer" AND is_read = 0', [req.params.id]);
    
    conversation.messages = messages;
    res.json({ success: true, data: conversation });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch conversation' });
  }
});

// Update conversation
router.patch('/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const { status, priority, assigned_to, is_starred } = req.body;
    const updates = [];
    const params = [];
    
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
    if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to || null); }
    if (is_starred !== undefined) { updates.push('is_starred = ?'); params.push(is_starred ? 1 : 0); }
    
    if (status === 'resolved') { updates.push('resolved_at = NOW()'); }
    
    if (updates.length === 0) return res.status(400).json({ success: false, message: 'No updates' });
    
    params.push(req.params.id);
    await execute(`UPDATE inbox_conversations SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Conversation updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update conversation' });
  }
});

// Send message
router.post('/messages', authMiddleware, async (req, res) => {
  try {
    await ensureTables();
    const { conversation_id, content, content_type, is_private, attachments } = req.body;
    
    if (!conversation_id || !content) {
      return res.status(400).json({ success: false, message: 'Conversation ID and content required' });
    }
    
    const result = await execute(
      `INSERT INTO inbox_messages (conversation_id, sender_type, sender_id, sender_name, content, content_type, is_private, attachments)
       VALUES (?, 'agent', ?, ?, ?, ?, ?, ?)`,
      [conversation_id, req.user.id, req.user.full_name, content, content_type || 'text', is_private ? 1 : 0, attachments ? JSON.stringify(attachments) : null]
    );
    
    // Update conversation last_message_at
    await execute('UPDATE inbox_conversations SET last_message_at = NOW() WHERE id = ?', [conversation_id]);
    
    // Update first_response_at if not set
    await execute(`
      UPDATE inbox_conversations SET first_response_at = NOW() 
      WHERE id = ? AND first_response_at IS NULL
    `, [conversation_id]);
    
    res.json({ success: true, message: 'Message sent', data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// Get channels
router.get('/channels', authMiddleware, async (req, res) => {
  try {
    await ensureTables();
    const channels = await query('SELECT * FROM inbox_channels ORDER BY channel_type');
    res.json({ success: true, data: channels });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch channels' });
  }
});

// Get templates
router.get('/templates', authMiddleware, async (req, res) => {
  try {
    await ensureTables();
    const templates = await query('SELECT * FROM inbox_templates WHERE is_active = 1 ORDER BY name');
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch templates' });
  }
});

// Create template
router.post('/templates', authMiddleware, async (req, res) => {
  try {
    await ensureTables();
    const { name, content, category, shortcut } = req.body;
    if (!name || !content) return res.status(400).json({ success: false, message: 'Name and content required' });
    
    const result = await execute(
      'INSERT INTO inbox_templates (name, content, category, shortcut, created_by) VALUES (?, ?, ?, ?, ?)',
      [name, content, category || null, shortcut || null, req.user.id]
    );
    res.json({ success: true, message: 'Template created', data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create template' });
  }
});

// Seed demo data
router.post('/seed', authMiddleware, async (req, res) => {
  try {
    await ensureTables();
    
    // Check if already seeded
    const existing = await query('SELECT COUNT(*) as count FROM inbox_channels');
    if (existing[0].count > 0) {
      return res.json({ success: true, message: 'Demo data already exists' });
    }
    
    // Add channels
    await execute(`
      INSERT INTO inbox_channels (channel_type, name, display_name, icon, color, is_enabled) VALUES
      ('email', 'support', 'Email Support', 'mail', '#3b82f6', 1),
      ('whatsapp', 'business', 'WhatsApp Business', 'whatsapp', '#25D366', 1),
      ('live_chat', 'website', 'Website Chat', 'chat', '#f59e0b', 1)
    `);
    
    // Add demo conversations
    const channelResult = await query('SELECT id FROM inbox_channels LIMIT 1');
    const channelId = channelResult[0]?.id || 1;
    
    const convResult = await execute(`
      INSERT INTO inbox_conversations (channel_id, customer_identifier, customer_name, customer_email, status, priority, last_message_at)
      VALUES (?, 'demo@example.com', 'John Demo', 'demo@example.com', 'open', 'medium', NOW())
    `, [channelId]);
    
    // Add demo messages
    await execute(`
      INSERT INTO inbox_messages (conversation_id, sender_type, sender_name, content, content_type) VALUES
      (?, 'customer', 'John Demo', 'Hello, I have a question about your services.', 'text'),
      (?, 'agent', 'Support Team', 'Hi John! How can I help you today?', 'text')
    `, [convResult.insertId, convResult.insertId]);
    
    res.json({ success: true, message: 'Demo data seeded successfully' });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ success: false, message: 'Failed to seed demo data' });
  }
});

export default router;


