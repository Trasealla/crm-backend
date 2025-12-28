/**
 * Trasealla CRM - Demo Data Seeder
 * Run with: node src/seeds/seed-demo-data.js
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'RootPassword123!',
  database: process.env.DB_NAME || 'trasealla_crm'
};

// Helper to get random item from array
const random = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDate = (start, end) => {
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString().split('T')[0];
};

// Demo Data
const companies = [
  { name: 'Emirates Properties Group', industry: 'Real Estate', website: 'emiratesproperties.ae' },
  { name: 'Gulf Tech Solutions', industry: 'Technology', website: 'gulftech.ae' },
  { name: 'Al Rashid Trading LLC', industry: 'Trading', website: 'alrashidtrading.com' },
  { name: 'Dubai Healthcare Center', industry: 'Healthcare', website: 'dhc.ae' },
  { name: 'Horizon Consulting', industry: 'Consulting', website: 'horizonconsult.ae' },
  { name: 'Palm Hospitality', industry: 'Hospitality', website: 'palmhospitality.com' },
  { name: 'Oasis Retail Chain', industry: 'Retail', website: 'oasisretail.ae' },
  { name: 'Desert Logistics Co.', industry: 'Logistics', website: 'desertlogistics.ae' },
  { name: 'Marina Financial Services', industry: 'Finance', website: 'marinafs.ae' },
  { name: 'Future Academy UAE', industry: 'Education', website: 'futureacademy.ae' },
  { name: 'Sunrise Manufacturing', industry: 'Manufacturing', website: 'sunrisemfg.ae' },
  { name: 'Cloud Nine Airlines', industry: 'Aviation', website: 'cloudnineair.com' },
  { name: 'Green Valley Farms', industry: 'Agriculture', website: 'greenvalley.ae' },
  { name: 'Metro Construction LLC', industry: 'Construction', website: 'metroconstruction.ae' },
  { name: 'Digital Marketing Pro', industry: 'Marketing', website: 'digitalmarketingpro.ae' },
  { name: 'Smart Home Systems', industry: 'Technology', website: 'smarthomesys.ae' },
  { name: 'Royal Insurance Group', industry: 'Insurance', website: 'royalinsurance.ae' },
  { name: 'Elite Motors Dubai', industry: 'Automotive', website: 'elitemotors.ae' },
  { name: 'Skyline Architects', industry: 'Architecture', website: 'skylinearch.ae' },
  { name: 'Global Exports LLC', industry: 'Trading', website: 'globalexports.ae' },
  { name: 'TechStart Innovations', industry: 'Technology', website: 'techstart.io' },
  { name: 'Burj Media Group', industry: 'Media', website: 'burjmedia.ae' },
  { name: 'Pearl Restaurant Chain', industry: 'Food & Beverage', website: 'pearlrestaurants.ae' },
  { name: 'SafeGuard Security', industry: 'Security', website: 'safeguardsec.ae' },
  { name: 'Express Courier Services', industry: 'Logistics', website: 'expresscourier.ae' },
];

const firstNames = [
  'Ahmed', 'Mohammed', 'Omar', 'Khalid', 'Youssef', 'Hassan', 'Ali', 'Tariq', 'Saeed', 'Rashid',
  'Fatima', 'Aisha', 'Mariam', 'Sara', 'Noura', 'Layla', 'Huda', 'Reem', 'Dana', 'Lina',
  'John', 'Michael', 'David', 'James', 'Robert', 'Sarah', 'Emily', 'Jessica', 'Jennifer', 'Lisa',
  'Raj', 'Amit', 'Priya', 'Neha', 'Vikram', 'Chen', 'Wei', 'Yuki', 'Kim', 'Park'
];

const lastNames = [
  'Al Rashid', 'Al Maktoum', 'Al Nahyan', 'Hassan', 'Abdullah', 'Ibrahim', 'Khalifa', 'Ahmad',
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez',
  'Patel', 'Kumar', 'Singh', 'Sharma', 'Lee', 'Kim', 'Wang', 'Chen', 'Yamamoto', 'Tanaka'
];

const jobTitles = [
  'CEO', 'CTO', 'CFO', 'COO', 'VP of Sales', 'VP of Marketing', 'Director of Operations',
  'Sales Manager', 'Marketing Manager', 'Project Manager', 'Account Executive', 'Business Analyst',
  'Software Engineer', 'Product Manager', 'HR Director', 'Finance Manager', 'Operations Director',
  'Procurement Manager', 'IT Director', 'Customer Success Manager'
];

const cities = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Al Ain'];
const sources = ['website', 'referral', 'linkedin', 'trade_show', 'cold_call', 'email_campaign', 'advertisement'];
const leadStatuses = ['new', 'contacted', 'qualified', 'unqualified', 'converted'];
const ratings = ['hot', 'warm', 'cold'];
const dealStages = ['discovery', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
const activityTypes = ['call', 'meeting', 'email', 'task', 'note'];
const priorities = ['low', 'medium', 'high'];

const products = [
  { name: 'CRM Enterprise License', sku: 'CRM-ENT-001', price: 15000, category: 'Software' },
  { name: 'CRM Professional License', sku: 'CRM-PRO-001', price: 8000, category: 'Software' },
  { name: 'CRM Starter License', sku: 'CRM-STR-001', price: 3000, category: 'Software' },
  { name: 'Implementation Services', sku: 'SVC-IMP-001', price: 25000, category: 'Services' },
  { name: 'Training Package (5 users)', sku: 'TRN-005-001', price: 5000, category: 'Training' },
  { name: 'Training Package (20 users)', sku: 'TRN-020-001', price: 15000, category: 'Training' },
  { name: 'Custom Development (per hour)', sku: 'DEV-HRS-001', price: 200, category: 'Services' },
  { name: 'Annual Support Package', sku: 'SUP-ANN-001', price: 12000, category: 'Support' },
  { name: 'Premium Support Package', sku: 'SUP-PRM-001', price: 24000, category: 'Support' },
  { name: 'Data Migration Service', sku: 'SVC-MIG-001', price: 8000, category: 'Services' },
  { name: 'API Integration Package', sku: 'SVC-API-001', price: 10000, category: 'Services' },
  { name: 'Cloud Hosting (Annual)', sku: 'HST-CLD-001', price: 6000, category: 'Hosting' },
  { name: 'On-Premise Installation', sku: 'SVC-ONP-001', price: 20000, category: 'Services' },
  { name: 'Security Audit Package', sku: 'SEC-AUD-001', price: 8000, category: 'Security' },
  { name: 'White Label License', sku: 'CRM-WHL-001', price: 50000, category: 'Software' },
];

async function seed() {
  console.log('🚀 Starting demo data seeding...\n');
  
  const connection = await mysql.createConnection(config);
  
  try {
    // Get the tenant_id (assuming there's at least one tenant)
    const [tenants] = await connection.query('SELECT id FROM tenants LIMIT 1');
    if (tenants.length === 0) {
      console.log('❌ No tenant found. Please register a tenant first.');
      return;
    }
    const tenantId = tenants[0].id;
    console.log(`📌 Using tenant ID: ${tenantId}\n`);

    // Get the user_id (staff table)
    const [users] = await connection.query('SELECT id FROM staff WHERE tenant_id = ? LIMIT 1', [tenantId]);
    const userId = users.length > 0 ? users[0].id : null;

    // Get pipeline and stages
    const [pipelines] = await connection.query('SELECT id FROM pipelines WHERE tenant_id = ? LIMIT 1', [tenantId]);
    let pipelineId = null;
    let stages = [];
    
    if (pipelines.length > 0) {
      pipelineId = pipelines[0].id;
      const [stageRows] = await connection.query('SELECT id, name, probability, is_won, is_lost FROM pipeline_stages WHERE pipeline_id = ? ORDER BY sort_order', [pipelineId]);
      stages = stageRows;
    }

    // ===== ACCOUNTS =====
    console.log('📦 Creating accounts...');
    const accountIds = [];
    for (const company of companies) {
      const [result] = await connection.query(
        `INSERT INTO accounts (tenant_id, name, industry, website, phone, email, city, country, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'UAE', 'active', ?)`,
        [
          tenantId,
          company.name,
          company.industry,
          `https://${company.website}`,
          `+971${randomInt(50, 59)}${randomInt(1000000, 9999999)}`,
          `info@${company.website}`,
          random(cities),
          userId
        ]
      );
      accountIds.push(result.insertId);
    }
    console.log(`   ✅ Created ${accountIds.length} accounts\n`);

    // ===== CONTACTS =====
    console.log('👥 Creating contacts...');
    const contactIds = [];
    for (let i = 0; i < 80; i++) {
      const firstName = random(firstNames);
      const lastName = random(lastNames);
      const accountId = random(accountIds);
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}@${companies[accountIds.indexOf(accountId) % companies.length].website}`;
      
      const [result] = await connection.query(
        `INSERT INTO contacts (tenant_id, account_id, first_name, last_name, email, phone, mobile, job_title, department, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          tenantId,
          accountId,
          firstName,
          lastName,
          email,
          `+971${randomInt(4, 4)}${randomInt(1000000, 9999999)}`,
          `+971${randomInt(50, 59)}${randomInt(1000000, 9999999)}`,
          random(jobTitles),
          random(['Sales', 'Marketing', 'IT', 'Finance', 'Operations', 'HR', 'Executive']),
          userId
        ]
      );
      contactIds.push(result.insertId);
    }
    console.log(`   ✅ Created ${contactIds.length} contacts\n`);

    // ===== LEADS =====
    console.log('🎯 Creating leads...');
    const leadIds = [];
    for (let i = 0; i < 120; i++) {
      const firstName = random(firstNames);
      const lastName = random(lastNames);
      const company = random(companies);
      const status = random(leadStatuses);
      
      const [result] = await connection.query(
        `INSERT INTO leads (tenant_id, first_name, last_name, company, job_title, email, phone, mobile, website, industry, city, country, source, status, rating, score, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UAE', ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          firstName,
          lastName,
          company.name,
          random(jobTitles),
          `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}@${company.website}`,
          `+971${randomInt(4, 4)}${randomInt(1000000, 9999999)}`,
          `+971${randomInt(50, 59)}${randomInt(1000000, 9999999)}`,
          `https://${company.website}`,
          company.industry,
          random(cities),
          random(sources),
          status,
          random(ratings),
          randomInt(10, 100),
          `Interested in our ${random(['CRM', 'ERP', 'software', 'services'])} solutions`,
          userId
        ]
      );
      leadIds.push(result.insertId);
    }
    console.log(`   ✅ Created ${leadIds.length} leads\n`);

    // ===== DEALS =====
    console.log('💰 Creating deals...');
    const dealIds = [];
    const dealNames = [
      'CRM Implementation', 'Enterprise License', 'Professional Services', 'Annual Support',
      'Training Program', 'Custom Development', 'Data Migration', 'System Integration',
      'Security Audit', 'Cloud Migration', 'API Development', 'White Label Solution'
    ];
    
    if (pipelineId && stages.length > 0) {
      for (let i = 0; i < 85; i++) {
        const stage = random(stages);
        const amount = randomInt(5000, 500000);
        const accountId = random(accountIds);
        const contactId = random(contactIds);
        
        let status = 'open';
        if (stage.is_won) status = 'won';
        if (stage.is_lost) status = 'lost';
        
        const [result] = await connection.query(
          `INSERT INTO deals (tenant_id, name, account_id, contact_id, pipeline_id, stage_id, amount, currency, probability, expected_close_date, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'AED', ?, ?, ?, ?)`,
          [
            tenantId,
            `${companies[accountIds.indexOf(accountId) % companies.length].name} - ${random(dealNames)}`,
            accountId,
            contactId,
            pipelineId,
            stage.id,
            amount,
            stage.probability || randomInt(10, 90),
            randomDate(new Date(), new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)),
            status,
            userId
          ]
        );
        dealIds.push(result.insertId);
      }
      console.log(`   ✅ Created ${dealIds.length} deals\n`);
    } else {
      console.log('   ⚠️ No pipeline found, skipping deals\n');
    }

    // ===== ACTIVITIES =====
    console.log('📅 Creating activities...');
    const activitySubjects = [
      'Follow up call', 'Product demo', 'Contract review', 'Requirements gathering',
      'Proposal presentation', 'Technical discussion', 'Pricing negotiation', 'Onboarding call',
      'Quarterly review', 'Support call', 'Training session', 'Implementation meeting',
      'Discovery call', 'Final negotiation', 'Contract signing'
    ];
    
    for (let i = 0; i < 150; i++) {
      const type = random(activityTypes);
      const dueDate = randomDate(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      );
      const isPast = new Date(dueDate) < new Date();
      const status = isPast ? (Math.random() > 0.3 ? 'completed' : 'pending') : 'pending';
      
      // Random related entity
      const relatedTypes = ['lead', 'deal', 'contact', 'account'];
      const relatedType = random(relatedTypes);
      let relatedId = null;
      
      if (relatedType === 'lead' && leadIds.length) relatedId = random(leadIds);
      else if (relatedType === 'deal' && dealIds.length) relatedId = random(dealIds);
      else if (relatedType === 'contact' && contactIds.length) relatedId = random(contactIds);
      else if (relatedType === 'account' && accountIds.length) relatedId = random(accountIds);
      
      await connection.query(
        `INSERT INTO activities (tenant_id, type, subject, description, due_date, due_time, priority, status, related_type, related_id, assigned_to, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          type,
          random(activitySubjects),
          `Activity related to ${relatedType}`,
          dueDate,
          `${randomInt(9, 17)}:${random(['00', '15', '30', '45'])}:00`,
          random(priorities),
          status,
          relatedId ? relatedType : null,
          relatedId,
          userId,
          userId
        ]
      );
    }
    console.log(`   ✅ Created 150 activities\n`);

    // ===== PRODUCTS =====
    console.log('📦 Creating products...');
    const productIds = [];
    for (const product of products) {
      const [result] = await connection.query(
        `INSERT INTO products (tenant_id, name, sku, unit_price, currency, category, is_active, created_by)
         VALUES (?, ?, ?, ?, 'AED', ?, 1, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [tenantId, product.name, product.sku, product.price, product.category, userId]
      );
      productIds.push(result.insertId || result.affectedRows);
    }
    console.log(`   ✅ Created ${products.length} products\n`);

    // ===== QUOTES =====
    console.log('📄 Creating quotes...');
    const quoteStatuses = ['draft', 'sent', 'accepted', 'rejected', 'revised'];
    const quoteSubjects = [
      'CRM Enterprise Implementation', 'Professional Services Quote', 'Annual Support Contract',
      'Training Program for Sales Team', 'Custom Development Project', 'Data Migration Services',
      'API Integration Package', 'Security Audit Services', 'Cloud Hosting Annual Plan'
    ];
    
    for (let i = 0; i < 45; i++) {
      const accountId = random(accountIds);
      const contactId = random(contactIds);
      const dealId = dealIds.length > 0 ? random(dealIds) : null;
      const status = random(quoteStatuses);
      const subtotal = randomInt(10000, 200000);
      const discount = Math.random() > 0.5 ? randomInt(500, subtotal * 0.15) : 0;
      const tax = (subtotal - discount) * 0.05;
      const total = subtotal - discount + tax;
      
      await connection.query(
        `INSERT INTO quotes (tenant_id, quote_number, subject, account_id, contact_id, deal_id, subtotal, discount, tax, total, currency, status, valid_until, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AED', ?, ?, ?, ?)`,
        [
          tenantId,
          `QT-${2024}${String(i + 1).padStart(4, '0')}`,
          random(quoteSubjects),
          accountId,
          contactId,
          dealId,
          subtotal,
          discount,
          tax,
          total,
          status,
          randomDate(new Date(), new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)),
          'Quote for CRM implementation and services',
          userId
        ]
      );
    }
    console.log(`   ✅ Created 45 quotes\n`);

    // ===== NOTES =====
    console.log('📝 Creating notes...');
    const noteTitles = [
      'Follow Up Required', 'Meeting Notes', 'Budget Discussion', 'Technical Requirements',
      'Contract Negotiation', 'Competitor Analysis', 'Integration Needs', 'Training Plan',
      'Security Compliance', 'Timeline Review', 'Pilot Program', 'Important Update'
    ];
    const noteContents = [
      'Client showed strong interest in our enterprise solution. Follow up next week.',
      'Discussed pricing options. They need approval from management.',
      'Technical requirements gathered. Need to prepare custom proposal.',
      'Meeting went well. Decision maker impressed with demo.',
      'Budget confirmed for Q1. Need to expedite proposal.',
      'Competitor also in talks. Need to highlight our unique features.',
      'Integration requirements discussed. Will need API customization.',
      'Training needs identified - 20 users for initial rollout.',
      'Security audit requirements shared. Preparing documentation.',
      'Timeline agreed: 3 months for full implementation.',
      'Contract terms negotiated. Legal review in progress.',
      'Pilot program approved. Starting with sales team.',
    ];
    
    for (let i = 0; i < 60; i++) {
      const relatedTypes = ['lead', 'deal', 'contact', 'account'];
      const relatedType = random(relatedTypes);
      let relatedId = null;
      
      if (relatedType === 'lead' && leadIds.length) relatedId = random(leadIds);
      else if (relatedType === 'deal' && dealIds.length) relatedId = random(dealIds);
      else if (relatedType === 'contact' && contactIds.length) relatedId = random(contactIds);
      else if (relatedType === 'account' && accountIds.length) relatedId = random(accountIds);
      
      await connection.query(
        `INSERT INTO notes (tenant_id, title, content, related_type, related_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, random(noteTitles), random(noteContents), relatedType, relatedId, userId]
      );
    }
    console.log(`   ✅ Created 60 notes\n`);

    // ===== TAGS =====
    console.log('🏷️ Creating tags...');
    const tags = [
      { name: 'VIP', color: '#f59e0b' },
      { name: 'Enterprise', color: '#3b82f6' },
      { name: 'SMB', color: '#22c55e' },
      { name: 'Hot Lead', color: '#ef4444' },
      { name: 'Partnership', color: '#8b5cf6' },
      { name: 'Referral', color: '#06b6d4' },
      { name: 'Government', color: '#14b8a6' },
      { name: 'Healthcare', color: '#ec4899' },
      { name: 'Technology', color: '#6366f1' },
      { name: 'Finance', color: '#84cc16' },
      { name: 'Priority', color: '#f97316' },
      { name: 'Follow Up', color: '#a855f7' },
    ];
    
    for (const tag of tags) {
      await connection.query(
        `INSERT INTO tags (tenant_id, name, color) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE color = VALUES(color)`,
        [tenantId, tag.name, tag.color]
      );
    }
    console.log(`   ✅ Created ${tags.length} tags\n`);

    // ===== CAMPAIGNS =====
    console.log('📢 Creating campaigns...');
    const campaigns = [
      { name: 'Q4 2024 Email Blast', type: 'email', budget: 15000, status: 'completed' },
      { name: 'LinkedIn Lead Gen', type: 'social', budget: 25000, status: 'active' },
      { name: 'Trade Show Dubai 2024', type: 'event', budget: 75000, status: 'completed' },
      { name: 'Google Ads Campaign', type: 'other', budget: 30000, status: 'active' },
      { name: 'Content Marketing Q1', type: 'other', budget: 20000, status: 'active' },
      { name: 'Webinar Series', type: 'other', budget: 10000, status: 'scheduled' },
      { name: 'Referral Program', type: 'other', budget: 50000, status: 'active' },
      { name: 'Partner Outreach', type: 'other', budget: 15000, status: 'active' },
    ];
    
    for (const campaign of campaigns) {
      await connection.query(
        `INSERT INTO campaigns (tenant_id, name, type, budget, status, start_date, end_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [
          tenantId,
          campaign.name,
          campaign.type,
          campaign.budget,
          campaign.status,
          randomDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), new Date()),
          randomDate(new Date(), new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)),
          userId
        ]
      );
    }
    console.log(`   ✅ Created ${campaigns.length} campaigns\n`);

    // ===== DOCUMENTS =====
    console.log('📎 Creating documents...');
    const documents = [
      { name: 'CRM Implementation Guide.pdf', type: 'PDF', category: 'Documentation' },
      { name: 'Product Brochure 2024.pdf', type: 'PDF', category: 'Marketing' },
      { name: 'Enterprise Pricing Sheet.xlsx', type: 'Excel', category: 'Sales' },
      { name: 'Technical Specifications.docx', type: 'Word', category: 'Technical' },
      { name: 'Case Study - Emirates Properties.pdf', type: 'PDF', category: 'Marketing' },
      { name: 'ROI Calculator.xlsx', type: 'Excel', category: 'Sales' },
      { name: 'Security Compliance Report.pdf', type: 'PDF', category: 'Compliance' },
      { name: 'Integration API Documentation.pdf', type: 'PDF', category: 'Technical' },
    ];
    
    for (const doc of documents) {
      await connection.query(
        `INSERT INTO documents (tenant_id, name, file_type, category, file_size, file_path, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [tenantId, doc.name, doc.type, doc.category, randomInt(100000, 5000000), `/uploads/${doc.name}`, userId]
      );
    }
    console.log(`   ✅ Created ${documents.length} documents\n`);

    // ===== SUMMARY =====
    console.log('═══════════════════════════════════════════');
    console.log('📊 DEMO DATA SUMMARY');
    console.log('═══════════════════════════════════════════');
    console.log(`   📦 Accounts:   ${accountIds.length}`);
    console.log(`   👥 Contacts:   ${contactIds.length}`);
    console.log(`   🎯 Leads:      ${leadIds.length}`);
    console.log(`   💰 Deals:      ${dealIds.length}`);
    console.log(`   📅 Activities: 150`);
    console.log(`   📦 Products:   ${products.length}`);
    console.log(`   📄 Quotes:     45`);
    console.log(`   📝 Notes:      60`);
    console.log(`   🏷️  Tags:       ${tags.length}`);
    console.log(`   📢 Campaigns:  ${campaigns.length}`);
    console.log(`   📎 Documents:  ${documents.length}`);
    console.log('═══════════════════════════════════════════');
    console.log('\n✅ Demo data seeding complete!');
    console.log('🔄 Refresh your browser to see the data.\n');

  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

seed().catch(console.error);

