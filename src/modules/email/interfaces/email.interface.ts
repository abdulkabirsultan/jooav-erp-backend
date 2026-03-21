import { EmailTemplateAlias, EmailPriority } from '../types/email.types';

export interface EmailRequest {
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  templateAlias: EmailTemplateAlias;
  variables: Record<string, string | number | undefined>;
  priority?: EmailPriority;
  metadata?: Record<string, any>;
}

export interface BatchEmailRequest extends EmailRequest {
  // Same as EmailRequest but used in arrays
}

export interface QueueEmailRequest extends EmailRequest {
  retries?: number;
  delay?: number;
}

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BatchEmailResponse {
  success: boolean;
  messageIds?: string[];
  errors?: string[];
}

export interface TemplateEmailRequest {
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  templateAlias: EmailTemplateAlias;
  variables: Record<string, string | number | undefined>;
  options?: {
    headers?: Record<string, string>;
    tags?: Array<{ name: string; value: string }>;
  };
}

export interface EmailEventPayload {
  event: string;
  data: any;
  priority: EmailPriority;
  recipients?: string[];
  metadata?: Record<string, any>;
}
