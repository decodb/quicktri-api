export enum MailTemplate {
  EMAIL_VERIFICATION = 'email-verification',
  FORGOT_PASSWORD = 'forgot-password',
}

export interface MailOptions {
  to: string;
  template: MailTemplate;
  context: Record<string, string>;
}
