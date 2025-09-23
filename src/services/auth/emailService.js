import nodemailer from 'nodemailer'
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createErrorResponse, createSuccessResponse, ERROR_TYPES } from '../../utils/responseUtils.js'
import { logger } from '../../utils/logger.js';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const buildUrl = (type, token) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${FRONTEND_URL}/${type}?token=${token}`;
};

const contentTemplate = (title, theme, buttonText, buttonUrl) => {
  return `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
      <div style="background: #007bff; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; color: white;">${title}</h1>
      </div>
      <div style="padding: 30px; background: #f9f9f9;">
          ${theme}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${buttonUrl}" 
              style="background-color: #007bff; color: white; padding: 12px 30px; 
              text-decoration: none; border-radius: 5px; display: inline-block;">
              ${buttonText}
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            或複製連結：<br>
            <span style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 4px; display: block; margin-top: 10px;">
              ${buttonUrl}
            </span>
          </p>
      </div>
    </div>
  `;
};

const sendMailService = async (to, subject, content) => {
  try {
    if (!to || !subject || !content) {
      logger.error('郵件發送參數不完整', { 
        hasTo: !!to, 
        hasSubject: !!subject, 
        hasContent: !!content 
      });
      return createErrorResponse(
        new Error('Missing required parameters'),
        ERROR_TYPES.AUTH.TOKEN.INVALID_INPUT
      );
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: to,
      subject: subject,
      html: content
    };

    logger.debug('準備發送郵件', { 
      to: '[REDACTED]',
      subject: subject,
      contentLength: content?.length || 0
    });

    const info = await transporter.sendMail(mailOptions);
    
    logger.info('郵件發送成功', { 
      messageId: info.messageId,
      to: '[REDACTED]'
    });
    
    return createSuccessResponse(null, '郵件發送成功');
  } catch (error) {
    logger.error('郵件發送失敗', error);
    return createErrorResponse(
      error,
      ERROR_TYPES.AUTH.TOKEN.EMAIL_SEND_FAILED
    );
  }
};

export {
  sendMailService,
  generateToken,
  buildUrl,
  contentTemplate
};