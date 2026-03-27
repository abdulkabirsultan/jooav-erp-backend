// Email template aliases and constants
export const EMAIL_TEMPLATES = {
  // Auth templates
  WELCOME: 'welcome',
  EMAIL_VERIFICATION: 'email-verification',
  PASSWORD_RESET: 'password-reset',
  PASSWORD_RESET_REQUEST: 'password-reset-request',
  PASSWORD_RESET_SUCCESS: 'password-reset-success',
  ACCOUNT_CREATED_INVITE: 'account-created-invite',
  LOGIN_ALERT: 'login-alert',

  // Order templates
  ORDER_CONFIRMATION: 'order-confirmation',
  ORDER_ASSIGNMENT: 'order-assignment',
  ORDER_STATUS_UPDATE: 'order-status-update',
  ORDER_COMPLETION: 'order-completion',
  ORDER_REASSIGNED: 'order-reassigned',
  ORDER_CANCELLED: 'order-cancelled',
  PAYMENT_INITIATED: 'payment-initiated',
  PAYMENT_FAILED: 'payment-failed',
  ASSIGNMENT_REJECTED: 'assignment-rejected',
  OUT_OF_STOCK_REPORT_OPENED: 'out-of-stock-report-opened',

  // Admin templates
  ADMIN_NEW_ORDER: 'admin-new-order',
  ADMIN_ASSIGNMENT_ALERT: 'admin-assignment-alert',
  ROLE_UPDATED: 'role-updated',
  ACCOUNT_DEACTIVATED: 'account-deactivated',

  // System templates
  SYSTEM_MAINTENANCE: 'system-maintenance',
  SYSTEM_ANNOUNCEMENT: 'system-announcement',
  SYSTEM_INCIDENT_ALERT: 'system-incident-alert',
} as const;

export type EmailTemplateAlias =
  (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];

export const TEMPLATE_REQUIRED_VARIABLES: Partial<
  Record<EmailTemplateAlias, readonly string[]>
> = {
  [EMAIL_TEMPLATES.WELCOME]: ['USER_NAME', 'LOGIN_URL'],
  [EMAIL_TEMPLATES.EMAIL_VERIFICATION]: [
    'USER_NAME',
    'VERIFICATION_LINK',
    'EXPIRY_TIME',
  ],
  [EMAIL_TEMPLATES.PASSWORD_RESET]: ['USER_NAME', 'RESET_LINK', 'EXPIRY_TIME'],
  [EMAIL_TEMPLATES.PASSWORD_RESET_REQUEST]: [
    'USER_NAME',
    'RESET_LINK',
    'EXPIRY_TIME',
  ],
  [EMAIL_TEMPLATES.PASSWORD_RESET_SUCCESS]: [
    'USER_NAME',
    'RESET_TIME',
    'IP_ADDRESS',
    'USER_AGENT',
  ],
  [EMAIL_TEMPLATES.ACCOUNT_CREATED_INVITE]: [
    'USER_NAME',
    'RESET_LINK',
    'EXPIRY_TIME',
  ],
  [EMAIL_TEMPLATES.ORDER_CONFIRMATION]: [
    'CUSTOMER_NAME',
    'ORDER_NUMBER',
    'ORDER_DATE',
    'ORDER_TOTAL',
    'ITEMS_COUNT',
    'VIEW_ORDER_URL',
  ],
  [EMAIL_TEMPLATES.ORDER_ASSIGNMENT]: [
    'OFFICER_NAME',
    'ORDER_NUMBER',
    'WHOLESALER_NAME',
    'ORDER_TOTAL',
    'ITEMS_COUNT',
    'ASSIGNMENT_URL',
  ],
  [EMAIL_TEMPLATES.ORDER_STATUS_UPDATE]: [
    'CUSTOMER_NAME',
    'ORDER_NUMBER',
    'OFFICER_NAME',
    'VIEW_ORDER_URL',
  ],
  [EMAIL_TEMPLATES.ORDER_COMPLETION]: [
    'CUSTOMER_NAME',
    'ORDER_NUMBER',
    'ORDER_DATE',
    'ORDER_TOTAL',
    'ITEMS_COUNT',
    'VIEW_ORDER_URL',
  ],
  [EMAIL_TEMPLATES.ORDER_REASSIGNED]: [
    'OFFICER_NAME',
    'ORDER_NUMBER',
    'WHOLESALER_NAME',
    'ORDER_TOTAL',
    'ITEMS_COUNT',
    'ASSIGNMENT_URL',
  ],
  [EMAIL_TEMPLATES.ORDER_CANCELLED]: [
    'ORDER_NUMBER',
    'ORDER_TOTAL',
    'CANCELLED_BY',
    'VIEW_ORDER_URL',
  ],
  [EMAIL_TEMPLATES.PAYMENT_INITIATED]: [
    'ORDER_NUMBER',
    'ORDER_TOTAL',
    'ORDER_DATE',
    'VIEW_ORDER_URL',
  ],
  [EMAIL_TEMPLATES.PAYMENT_FAILED]: [
    'ORDER_NUMBER',
    'ORDER_TOTAL',
    'REASON',
    'VIEW_ORDER_URL',
  ],
  [EMAIL_TEMPLATES.ASSIGNMENT_REJECTED]: [
    'ORDER_NUMBER',
    'OFFICER_NAME',
    'REASON',
    'ADMIN_ORDER_URL',
  ],
  [EMAIL_TEMPLATES.OUT_OF_STOCK_REPORT_OPENED]: [
    'REPORT_ID',
    'WHOLESALER_NAME',
    'ITEM_COUNT',
    'ADMIN_REPORT_URL',
  ],
  [EMAIL_TEMPLATES.ADMIN_NEW_ORDER]: [
    'ORDER_NUMBER',
    'CUSTOMER_NAME',
    'ORDER_TOTAL',
    'ADMIN_ORDER_URL',
  ],
  [EMAIL_TEMPLATES.ADMIN_ASSIGNMENT_ALERT]: [
    'ORDER_NUMBER',
    'OFFICER_NAME',
    'ADMIN_ORDER_URL',
  ],
  [EMAIL_TEMPLATES.ROLE_UPDATED]: ['USER_NAME', 'OLD_ROLE', 'NEW_ROLE'],
  [EMAIL_TEMPLATES.ACCOUNT_DEACTIVATED]: ['USER_NAME', 'REASON'],
  [EMAIL_TEMPLATES.SYSTEM_MAINTENANCE]: [
    'USER_NAME',
    'MAINTENANCE_DATE',
    'MAINTENANCE_DURATION',
    'MAINTENANCE_REASON',
  ],
  [EMAIL_TEMPLATES.SYSTEM_ANNOUNCEMENT]: ['USER_NAME'],
  [EMAIL_TEMPLATES.SYSTEM_INCIDENT_ALERT]: ['USER_NAME'],
  [EMAIL_TEMPLATES.LOGIN_ALERT]: ['USER_NAME'],
};

// Email event types
export enum EmailEvent {
  // Auth Events
  USER_REGISTERED = 'auth.user_registered',
  EMAIL_VERIFICATION = 'auth.email_verification',
  PASSWORD_RESET = 'auth.password_reset',
  LOGIN_ALERT = 'auth.login_alert',

  // User Administration Events
  USER_ROLE_UPDATED = 'user.role_updated',
  USER_ACCOUNT_DEACTIVATED = 'user.account_deactivated',

  // Order Events
  ORDER_CONFIRMED = 'order.confirmed',
  ORDER_ASSIGNED = 'order.assigned',
  ORDER_STATUS_CHANGED = 'order.status_changed',
  ORDER_COMPLETED = 'order.completed',
  ORDER_REASSIGNED = 'order.reassigned',
  ORDER_CANCELLED = 'order.cancelled',
  ORDER_ASSIGNMENT_REJECTED = 'order.assignment_rejected',
  ORDER_ASSIGNMENT_ACCEPTED = 'order.assignment_accepted',
  OUT_OF_STOCK_REPORT_OPENED = 'order.out_of_stock_report_opened',

  // Payment Events
  PAYMENT_INITIATED = 'payment.initiated',
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
