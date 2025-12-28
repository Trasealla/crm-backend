import { query } from '../lib/database.js';

/**
 * Tenant Middleware
 * Extracts tenant context from request and validates access
 */
export const tenantMiddleware = async (req, res, next) => {
  try {
    // Skip tenant check for platform super admins
    if (req.user && req.user.permissions?.platform_owner) {
      req.tenantId = req.query.tenant_id || req.body?.tenant_id || null;
      return next();
    }
    
    // Get tenant ID from various sources
    let tenantId = null;
    
    // 1. From authenticated user
    if (req.user?.tenant_id) {
      tenantId = req.user.tenant_id;
    }
    
    // 2. From subdomain (e.g., company.crm.trasealla.com)
    if (!tenantId) {
      const host = req.get('host');
      const subdomain = extractSubdomain(host);
      if (subdomain && subdomain !== 'api' && subdomain !== 'www') {
        const [tenant] = await query('SELECT id FROM tenants WHERE subdomain = ? AND status = "active"', [subdomain]);
        if (tenant) {
          tenantId = tenant.id;
        }
      }
    }
    
    // 3. From custom header
    if (!tenantId && req.headers['x-tenant-id']) {
      tenantId = parseInt(req.headers['x-tenant-id']);
    }
    
    // 4. From query parameter (for API access)
    if (!tenantId && req.query.tenant_id) {
      tenantId = parseInt(req.query.tenant_id);
    }
    
    // Validate tenant exists and is active
    if (tenantId) {
      const [tenant] = await query(
        'SELECT t.*, s.plan, s.max_users, s.current_users, s.status as subscription_status FROM tenants t LEFT JOIN subscriptions s ON t.id = s.tenant_id WHERE t.id = ?',
        [tenantId]
      );
      
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'Tenant not found' });
      }
      
      if (tenant.status === 'suspended') {
        return res.status(403).json({ success: false, message: 'Account suspended. Please contact support.' });
      }
      
      if (tenant.status === 'cancelled') {
        return res.status(403).json({ success: false, message: 'Account cancelled.' });
      }
      
      // Check if trial expired
      if (tenant.status === 'trial' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date()) {
        return res.status(403).json({ success: false, message: 'Trial period expired. Please upgrade to continue.' });
      }
      
      req.tenantId = tenantId;
      req.tenant = tenant;
    }
    
    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    next(error);
  }
};

/**
 * Require Tenant Middleware
 * Ensures a valid tenant is present in the request
 */
export const requireTenant = (req, res, next) => {
  if (!req.tenantId && !req.user?.permissions?.platform_owner) {
    return res.status(400).json({ success: false, message: 'Tenant context required' });
  }
  next();
};

/**
 * Check User Limit Middleware
 * Ensures tenant hasn't exceeded user limit
 */
export const checkUserLimit = async (req, res, next) => {
  try {
    if (!req.tenantId) return next();
    
    const [subscription] = await query(
      'SELECT max_users, current_users FROM subscriptions WHERE tenant_id = ? AND status = "active"',
      [req.tenantId]
    );
    
    if (subscription && subscription.current_users >= subscription.max_users) {
      return res.status(403).json({
        success: false,
        message: `User limit reached (${subscription.max_users}). Please upgrade your plan.`
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check Feature Access Middleware
 * Ensures tenant has access to a specific feature
 */
export const checkFeature = (feature) => {
  return async (req, res, next) => {
    try {
      if (req.user?.permissions?.platform_owner) return next();
      
      if (!req.tenantId) {
        return res.status(400).json({ success: false, message: 'Tenant context required' });
      }
      
      const [subscription] = await query(
        'SELECT features FROM subscriptions WHERE tenant_id = ? AND status = "active"',
        [req.tenantId]
      );
      
      if (!subscription) {
        return res.status(403).json({ success: false, message: 'No active subscription' });
      }
      
      let features = subscription.features;
      if (typeof features === 'string') {
        features = JSON.parse(features);
      }
      
      // Check if feature is enabled
      if (!features || (!features.all && !features[feature])) {
        return res.status(403).json({
          success: false,
          message: `Feature '${feature}' is not available in your plan. Please upgrade.`
        });
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Helper function to extract subdomain
function extractSubdomain(host) {
  if (!host) return null;
  
  // Remove port if present
  host = host.split(':')[0];
  
  // Split by dots
  const parts = host.split('.');
  
  // For localhost, return null
  if (host.includes('localhost')) return null;
  
  // For domains like company.crm.trasealla.com, return 'company'
  if (parts.length >= 3) {
    return parts[0];
  }
  
  return null;
}

export default tenantMiddleware;


