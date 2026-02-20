export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  PROCUREMENT_OFFICER = 'PROCUREMENT_OFFICER',
  WHOLESALER = 'WHOLESALER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  DEACTIVATED = 'DEACTIVATED',
  BLOCKED = 'BLOCKED',
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum OrderItemStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SOURCING = 'SOURCING',
  READY = 'READY',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  UNAVAILABLE = 'UNAVAILABLE',
  CANCELLED = 'CANCELLED',
}

export enum AssignmentStatus {
  UNASSIGNED = 'UNASSIGNED',
  PENDING_ACCEPTANCE = 'PENDING_ACCEPTANCE',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  REASSIGNED = 'REASSIGNED',
}

export enum ProcurementOfficerStatus {
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECKOUT_URL = 'CHECKOUT_URL',
}

export enum DocumentType {
  INVOICE = 'invoice',
  RECEIPT = 'receipt',
  CONTRACT = 'contract',
  PROPOSAL = 'proposal',
  REPORT = 'report',
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ProductStatus {
  DRAFT = 'DRAFT',
  QUEUE = 'QUEUE',
  LIVE = 'LIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum PackSizeStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum PackTypeStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}
