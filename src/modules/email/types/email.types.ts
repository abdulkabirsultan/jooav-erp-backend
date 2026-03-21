// Email template aliases and constants
export const EMAIL_TEMPLATES = {
  // Auth templates
  WELCOME: 'welcome',
  EMAIL_VERIFICATION: 'email-verification',
  PASSWORD_RESET: 'password-reset',
  LOGIN_ALERT: 'login-alert',

  // Order templates
  ORDER_CONFIRMATION: 'order-confirmation',
  ORDER_ASSIGNMENT: 'order-assignment',
  ORDER_STATUS_UPDATE: 'order-status-update',
  ORDER_COMPLETION: 'order-completion',

  // Admin templates
  ADMIN_NEW_ORDER: 'admin-new-order',
  ADMIN_ASSIGNMENT_ALERT: 'admin-assignment-alert',

  // System templates
  SYSTEM_MAINTENANCE: 'system-maintenance',
  SYSTEM_ANNOUNCEMENT: 'system-announcement',
} as const;

export type EmailTemplateAlias =
  (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];

// Email event types
export enum EmailEvent {
  // Auth Events
  USER_REGISTERED = 'auth.user_registered',
  EMAIL_VERIFICATION = 'auth.email_verification',
  PASSWORD_RESET = 'auth.password_reset',
  LOGIN_ALERT = 'auth.login_alert',

  // Order Events
  ORDER_CONFIRMED = 'order.confirmed',
  ORDER_ASSIGNED = 'order.assigned',
  ORDER_STATUS_CHANGED = 'order.status_changed',
  ORDER_COMPLETED = 'order.completed',

  // Payment Events
  PAYMENT_RECEIVED = 'payment.received',
  PAYMENT_FAILED = 'payment.failed',

  // System Events
  SYSTEM_MAINTENANCE = 'system.maintenance',
  BULK_NOTIFICATION = 'system.bulk_notification',
}

// Email priority levels
export enum EmailPriority {
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

// Template variable interfaces
export interface OrderEmailVariables extends Record<string, string | number> {
  CUSTOMER_NAME: string;
  ORDER_NUMBER: string;
  ORDER_DATE: string;
  ORDER_TOTAL: string;
  ITEMS_COUNT: number;
  VIEW_ORDER_URL: string;
}

export interface AuthEmailVariables extends Record<
  string,
  string | number | undefined
> {
  USER_NAME: string;
  RESET_LINK?: string;
  VERIFICATION_LINK?: string;
  EXPIRY_TIME?: string;
}

export interface AssignmentEmailVariables extends Record<
  string,
  string | number
> {
  OFFICER_NAME: string;
  ORDER_NUMBER: string;
  WHOLESALER_NAME: string;
  ORDER_TOTAL: string;
  ITEMS_COUNT: number;
  ASSIGNMENT_URL: string;
}
