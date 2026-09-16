export enum MailTemplate {
  EMAIL_VERIFICATION = 'email-verification',
  FORGOT_PASSWORD = 'forgot-password',
  RESET_PASSWORD_SUCCESS = 'reset-password-success',
}

export interface MailOptions {
  to: string;
  template: MailTemplate;
  context: Record<string, string>;
}
