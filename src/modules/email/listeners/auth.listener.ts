import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../services/notification.service';
import { EmailEvent } from '../types/email.types';

@Injectable()
export class AuthEmailListener {
  private readonly logger = new Logger(AuthEmailListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(EmailEvent.USER_REGISTERED)
  async handleUserRegistration(payload: { user: any }) {
    try {
      await this.notificationService.notifyWelcome(payload.user);
      this.logger.log(
        `User registration email event handled for user: ${payload.user.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle user registration email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.EMAIL_VERIFICATION)
  async handleEmailVerification(payload: {
    user: any;
    verificationToken: string;
  }) {
    try {
      await this.notificationService.notifyEmailVerification(
        payload.user,
        payload.verificationToken,
      );
      this.logger.log(
        `Email verification event handled for user: ${payload.user.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle email verification event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.PASSWORD_RESET)
  async handlePasswordReset(payload: { user: any; resetToken: string }) {
    try {
      await this.notificationService.notifyPasswordReset(
        payload.user,
        payload.resetToken,
      );
      this.logger.log(
        `Password reset email event handled for user: ${payload.user.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle password reset email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.LOGIN_ALERT)
  async handleLoginAlert(payload: { user: any; loginInfo: any }) {
    try {
      // TODO: Implement login alert notification if needed
      this.logger.log(
        `Login alert email event handled for user: ${payload.user.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle login alert email event: ${error.message}`,
        error.stack,
      );
    }
  }
}
