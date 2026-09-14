export enum MailTemplate {
  EMAIL_VERIFICATION = 'email-verification',
}

export interface MailOptions {
  to: string;
  template: MailTemplate;
  context: Record<string, string>;
}
