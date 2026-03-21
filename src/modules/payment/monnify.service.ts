import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

export interface CreateInvoiceRequest {
  amount: number;
  invoiceReference: string;
  description: string;
  customerName: string;
  customerEmail: string;
  contractCode: string;
  currencyCode: string;
  expiryDate: Date;
  paymentMethods: string[];
  redirectUrl: string;
}

export interface CreateInvoiceResponse {
  requestSuccessful: boolean;
  responseMessage: string;
  responseCode: string;
  responseBody: {
    amount: number;
    invoiceReference: string;
    invoiceStatus: string;
    description: string;
    contractCode: string;
    customerEmail: string;
    customerName: string;
    expiryDate: string;
    createdBy: string;
    createdOn: string;
    checkoutUrl: string;
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string;
    redirectUrl: string;
    transactionReference: string;
    metaData: any;
  };
}

export interface InvoiceStatusResponse {
  requestSuccessful: boolean;
  responseMessage: string;
  responseCode: string;
  responseBody: {
    transactionReference: string;
    invoiceReference: string;
    amount: number;
    invoiceStatus: string;
    paymentStatus: string;
    amountPaid: number;
    paidOn: string;
    paymentMethod: string;
  };
}

export interface MonnifyWebhookData {
  transactionReference: string;
  paymentReference: string;
  amountPaid: number;
  totalPayable: number;
  paidOn: string;
  paymentStatus: string;
  paymentMethod: string;
  product: {
    type: string;
    reference: string;
  };
  paymentDescription: string;
  transactionHash: string;
  customer: {
    name: string;
    email: string;
  };
}

interface AuthResponse {
  requestSuccessful: boolean;
  responseMessage: string;
  responseCode: string;
  responseBody: {
    accessToken: string;
    expiresIn: number;
  };
}

@Injectable()
export class MonnifyService {
  private readonly logger = new Logger(MonnifyService.name);
  private readonly httpClient: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private authenticationPromise: Promise<string> | null = null;

  constructor(private readonly configService: ConfigService) {
    const baseURL = this.configService.get<string>('MONNIFY_BASE_URL');

    this.httpClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config || {};

        // If it's an authentication error and we haven't already retried
        if (
          this.isTokenAuthError(error) &&
          !originalRequest._retry &&
          !this.isAuthEndpoint(originalRequest.url)
        ) {
          originalRequest._retry = true;

          try {
            // Force re-authentication
            this.accessToken = null;
            this.tokenExpiry = null;
            const newToken = await this.authenticate(true);

            // Retry the original request with new token
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.httpClient(originalRequest);
          } catch (authError) {
            this.logger.error('Failed to re-authenticate:', authError.message);
            throw new HttpException(
              'Authentication failed',
              HttpStatus.UNAUTHORIZED,
            );
          }
        }

        this.logger.error(
          'Monnify API Error:',
          error.response?.data || error.message,
        );
        throw new HttpException(
          error.response?.data?.responseMessage || 'Monnify API Error',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      },
    );
  }

  /**
   * Get or refresh access token
   */
  private async authenticate(forceRefresh = false): Promise<string> {
    // Check if token is still valid (add 1 minute buffer)
    if (
      !forceRefresh &&
      this.accessToken &&
      this.tokenExpiry &&
      new Date() < this.tokenExpiry
    ) {
      return this.accessToken;
    }

    if (this.authenticationPromise) {
      return this.authenticationPromise;
    }

    const apiKey = this.configService.get<string>('MONNIFY_API_KEY');
    const secretKey = this.configService.get<string>('MONNIFY_SECRET_KEY');

    if (!apiKey || !secretKey) {
      throw new HttpException(
        'Monnify credentials not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.authenticationPromise = (async () => {
      try {
        this.logger.debug('Authenticating with Monnify...');
        const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString(
          'base64',
        );

        const response = await this.httpClient.post<AuthResponse>(
          '/api/v1/auth/login',
          {},
          {
            headers: {
              Authorization: `Basic ${credentials}`,
            },
            timeout: 10000,
          },
        );

        if (!response.data.requestSuccessful) {
          this.logger.error(
            'Monnify authentication failed:',
            response.data.responseMessage,
          );
          throw new HttpException(
            response.data.responseMessage,
            HttpStatus.UNAUTHORIZED,
          );
        }

        this.accessToken = response.data.responseBody.accessToken;

        const expiresInSeconds = Number(response.data.responseBody.expiresIn);
        const expiryFromResponse = new Date(
          Date.now() + expiresInSeconds * 1000,
        );
        const expiryFromToken = this.getTokenExpiryFromJwt(this.accessToken);

        const effectiveExpiry =
          expiryFromToken && expiryFromToken < expiryFromResponse
            ? expiryFromToken
            : expiryFromResponse;

        // Keep a 2-minute safety margin to avoid edge expirations in-flight
        const bufferedExpiry = new Date(effectiveExpiry.getTime() - 120000);
        this.tokenExpiry =
          bufferedExpiry > new Date()
            ? bufferedExpiry
            : new Date(Date.now() + 30000);

        this.logger.log('Successfully authenticated with Monnify');
        return this.accessToken;
      } catch (error) {
        this.accessToken = null;
        this.tokenExpiry = null;
        this.logger.error(
          'Failed to authenticate with Monnify:',
          error.message,
        );
        throw new HttpException(
          'Authentication failed',
          HttpStatus.UNAUTHORIZED,
        );
      } finally {
        this.authenticationPromise = null;
      }
    })();

    return this.authenticationPromise;
  }

  private isAuthEndpoint(url?: string): boolean {
    return typeof url === 'string' && url.includes('/api/v1/auth/login');
  }

  private isTokenAuthError(error: any): boolean {
    const status = error?.response?.status;
    const responseMessage =
      error?.response?.data?.responseMessage?.toLowerCase?.() || '';
    const errorMessage = error?.message?.toLowerCase?.() || '';

    if (status === 401 || status === 403) {
      return true;
    }

    return (
      responseMessage.includes('token') ||
      responseMessage.includes('unauthorized') ||
      errorMessage.includes('token') ||
      errorMessage.includes('unauthorized')
    );
  }

  private getTokenExpiryFromJwt(token: string): Date | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) {
        return null;
      }

      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(
        base64.length + ((4 - (base64.length % 4)) % 4),
        '=',
      );
      const payload = JSON.parse(
        Buffer.from(padded, 'base64').toString('utf8'),
      );

      if (!payload?.exp) {
        return null;
      }

      return new Date(payload.exp * 1000);
    } catch {
      return null;
    }
  }

  /**
   * Create invoice for dynamic virtual account
   */
  async createInvoice(
    invoiceData: CreateInvoiceRequest,
  ): Promise<CreateInvoiceResponse> {
    const token = await this.authenticate();
    const contractCode = this.configService.get<string>(
      'MONNIFY_CONTRACT_CODE',
    );

    if (!contractCode) {
      throw new HttpException(
        'Monnify contract code not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const payload = {
      amount: invoiceData.amount,
      invoiceReference: invoiceData.invoiceReference,
      description: invoiceData.description,
      currencyCode: invoiceData.currencyCode || 'NGN',
      contractCode,
      customerEmail: invoiceData.customerEmail,
      customerName: invoiceData.customerName,
      expiryDate: invoiceData.expiryDate
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19),
      redirectUrl: invoiceData.redirectUrl,
    };

    try {
      const response = await this.httpClient.post<CreateInvoiceResponse>(
        '/api/v1/invoice/create',
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.data.requestSuccessful) {
        throw new HttpException(
          response.data.responseMessage,
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(
        `Invoice created successfully: ${invoiceData.invoiceReference}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create invoice:', error.message);
      throw error;
    }
  }

  /**
   * Get invoice status
   */
  async getInvoiceStatus(
    invoiceReference: string,
  ): Promise<InvoiceStatusResponse> {
    const token = await this.authenticate();

    try {
      this.logger.debug(`Getting status for invoice: ${invoiceReference}`);

      const response = await this.httpClient.get<CreateInvoiceResponse>(
        `/api/v1/invoice/${invoiceReference}/details`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.data.requestSuccessful) {
        this.logger.error(
          'Monnify invoice status error:',
          response.data.responseMessage,
        );
        throw new HttpException(
          response.data.responseMessage,
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.debug('Successfully retrieved invoice status');

      // Transform the response to match InvoiceStatusResponse interface
      return {
        requestSuccessful: response.data.requestSuccessful,
        responseMessage: response.data.responseMessage,
        responseCode: response.data.responseCode,
        responseBody: {
          transactionReference: response.data.responseBody.transactionReference,
          invoiceReference: response.data.responseBody.invoiceReference,
          amount: response.data.responseBody.amount,
          invoiceStatus: response.data.responseBody.invoiceStatus,
          paymentStatus:
            response.data.responseBody.invoiceStatus === 'PAID'
              ? 'PAID'
              : 'PENDING',
          amountPaid:
            response.data.responseBody.invoiceStatus === 'PAID'
              ? response.data.responseBody.amount
              : 0,
          paidOn:
            response.data.responseBody.invoiceStatus === 'PAID'
              ? response.data.responseBody.createdOn
              : '',
          paymentMethod:
            response.data.responseBody.invoiceStatus === 'PAID'
              ? 'BANK_TRANSFER'
              : '',
        },
      };
    } catch (error) {
      this.logger.error('Failed to get payment status:', error.message);
      throw error;
    }
  }

  /**
   * Cancel an invoice (for draft/unpaid orders)
   */
  async cancelInvoice(invoiceReference: string): Promise<boolean> {
    const token = await this.authenticate();

    try {
      this.logger.debug(`Cancelling invoice: ${invoiceReference}`);

      const response = await this.httpClient.delete(
        `/api/invoice/${invoiceReference}/cancel`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 10000,
        },
      );

      if (response.data?.requestSuccessful) {
        this.logger.log(`Invoice cancelled successfully: ${invoiceReference}`);
        return true;
      } else {
        this.logger.warn(
          `Failed to cancel invoice ${invoiceReference}: ${response.data?.responseMessage}`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Error cancelling invoice ${invoiceReference}:`,
        error.message,
      );
      // Don't throw error - cancellation failure shouldn't block order cancellation
      return false;
    }
  }

  /**
   * Verify Monnify webhook signature
   * Implements SHA-512 HMAC signature verification as per Monnify documentation
   */
  async verifyWebhook(webhookData: any, signature: string): Promise<boolean> {
    try {
      const clientSecret = this.configService.get<string>('MONNIFY_SECRET_KEY');
      if (!clientSecret) {
        this.logger.error('MONNIFY_SECRET_KEY not configured');
        return false;
      }

      if (!signature) {
        this.logger.warn('No monnify-signature header provided');
        return false;
      }

      // Convert webhook data to string (must match exactly how Monnify computes it)
      const stringifiedData = JSON.stringify(webhookData);

      // Compute HMAC-SHA512 signature
      const computedSignature = crypto
        .createHmac('sha512', clientSecret)
        .update(stringifiedData)
        .digest('hex');

      // Compare signatures
      const isValid = computedSignature === signature;

      if (!isValid) {
        this.logger.warn('Webhook signature mismatch', {
          computed: computedSignature,
          received: signature,
          data: stringifiedData,
        });
      } else {
        this.logger.log('Webhook signature verified successfully');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Failed to verify webhook signature:', error.message);
      return false;
    }
  }

  /**
   * Validate webhook IP address
   * Monnify webhooks come from: 35.242.133.146
   */
  validateWebhookIP(clientIP: string): boolean {
    const allowedIPs = [
      '35.242.133.146',
      '127.0.0.1', // Allow localhost for development
      '::1', // Allow localhost IPv6 for development
      '::ffff:127.0.0.1', // Allow mapped localhost for development
    ];

    const isDevelopment = this.configService.get('NODE_ENV') !== 'production';

    if (isDevelopment) {
      this.logger.log(`Development mode: allowing IP ${clientIP}`);
      return true;
    }

    const isValid = allowedIPs.includes(clientIP);
    if (!isValid) {
      this.logger.warn(`Webhook request from unauthorized IP: ${clientIP}`);
    }

    return isValid;
  }
}
