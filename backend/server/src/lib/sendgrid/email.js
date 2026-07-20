import sgMail from '@sendgrid/mail';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from './crypto.js';
import {draw} from  '../lib/qrcode_generate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const replaceTemplateVariables = (template, data) => {
  let processedTemplate = template;

  // Replace all {{variable}} with actual values
  Object.keys(data).forEach((key) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    processedTemplate = processedTemplate.replace(regex, data[key] || '');
  });

  return processedTemplate;
};


export const sendPendingRegistrationEmail = async ({
  to,
  userName,
  clubName,
  registrationId,
  submissionDate,
  amount,
}) => {
  try {
    // Read the HTML template
    const templatePath = path.join(__dirname, '../templates/emails/pending.html');
    const htmlTemplate = await fs.readFile(templatePath, 'utf-8');

    // Prepare template data
    const templateData = {
      userName: userName || 'Valued Member',
      clubName: clubName || 'Rotary Club',
      registrationId: registrationId || 'N/A',
      submissionDate: submissionDate || new Date().toLocaleDateString(),
      amount: amount || '0.00',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@rotaryclub.com',
      supportPhone: process.env.SUPPORT_PHONE || '+1 (555) 123-4567',
      year: new Date().getFullYear(),
    };

    // Replace template variables
    const htmlContent = replaceTemplateVariables(htmlTemplate, templateData);

    // Email configuration
    const msg = {
      to: to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@rotaryclub.com',
        name: process.env.SENDGRID_FROM_NAME || 'Rotary Club',
      },
      subject: `Registration Pending - ${clubName}`,
      html: htmlContent,
    };

    // Send email
    const response = await sgMail.send(msg);

    return {
      success: true,
      messageId: response[0].headers['x-message-id'],
    };
  } catch (error) {
    console.error('SendGrid Error:', error);

    if (error.response) {
      console.error('SendGrid Response Error:', error.response.body);
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
};


export const sendEmail = async ({ to, subject, templatePath, templateData }) => {
  try {
    // Read the HTML template
    const fullTemplatePath = path.join(__dirname, templatePath);
    const htmlTemplate = await fs.readFile(fullTemplatePath, 'utf-8');

    // Add default values
    const data = {
      ...templateData,
      year: templateData.year || new Date().getFullYear(),
      supportEmail: templateData.supportEmail || process.env.SUPPORT_EMAIL || 'support@rotaryclub.com',
      supportPhone: templateData.supportPhone || process.env.SUPPORT_PHONE || '+1 (555) 123-4567',
    };

    // Replace template variables
    const htmlContent = replaceTemplateVariables(htmlTemplate, data);

    // Email configuration
    const msg = {
      to: to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@rotaryclub.com',
        name: process.env.SENDGRID_FROM_NAME || 'Rotary Club',
      },
      subject: subject,
      html: htmlContent,
    };

    // Send email
    const response = await sgMail.send(msg);

    return {
      success: true,
      messageId: response[0].headers['x-message-id'],
    };
  } catch (error) {
    console.error('SendGrid Error:', error);

    if (error.response) {
      console.error('SendGrid Response Error:', error.response.body);
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
};

/**
 * Send transaction approved email
 * @param {Object} params - Email parameters
 * @param {string} params.to - Recipient email address
 * @param {string} params.userName - User's name
 * @param {string} params.clubName - Club name
 * @param {string} params.registrationId - Transaction/Registration ID
 * @param {string} params.approvalDate - Date of approval
 * @param {string} params.amount - Amount paid
 */
export const sendTransactionApprovedEmail = async ({
  to,
  userName,
  clubName,
  registrationId,
  approvalDate,
  amount,
}) => {
  try {
    // Read the HTML template
    const templatePath = path.join(__dirname, '../templates/emails/approved.html');
    const htmlTemplate = await fs.readFile(templatePath, 'utf-8');

    // Prepare template data
    const templateData = {
      userName: userName || 'Valued Member',
      clubName: clubName || 'Rotary Club',
      registrationId: registrationId || 'N/A',
      approvalDate: approvalDate || new Date().toLocaleDateString(),
      amount: amount || '0.00',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@rotaryclub.com',
      supportPhone: process.env.SUPPORT_PHONE || '+1 (555) 123-4567',
      year: new Date().getFullYear(),
    };

    // Replace template variables
    const htmlContent = replaceTemplateVariables(htmlTemplate, templateData);

    // Email configuration
    const msg = {
      to: to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@rotaryclub.com',
        name: process.env.SENDGRID_FROM_NAME || 'Rotary Club',
      },
      subject: `Registration Approved - ${clubName}`,
      html: htmlContent,
    };

    // Send email
    const response = await sgMail.send(msg);

    return {
      success: true,
      messageId: response[0].headers['x-message-id'],
    };
  } catch (error) {
    console.error('SendGrid Error:', error);

    if (error.response) {
      console.error('SendGrid Response Error:', error.response.body);
    }

    throw new Error(`Failed to send approval email: ${error.message}`);
  }
};

/**
 * Send transaction rejected email
 * @param {Object} params - Email parameters
 * @param {string} params.to - Recipient email address
 * @param {string} params.userName - User's name
 * @param {string} params.clubName - Club name
 * @param {string} params.registrationId - Transaction/Registration ID
 * @param {string} params.reviewDate - Date of review
 * @param {string} params.amount - Amount
 * @param {string} params.remarks - Reason for rejection
 * @param {string} params.uploadUrl - URL for uploading new proof of payment
 */
export const sendTransactionRejectedEmail = async ({
  to,
  clubId,
  userName,
  clubName,
  registrationId,
  reviewDate,
  amount,
  remarks,
  uploadUrl,
}) => {
  try {
    // Read the HTML template
    const templatePath = path.join(__dirname, '../templates/emails/rejected.html');
    const htmlTemplate = await fs.readFile(templatePath, 'utf-8');

    // Encrypt registration ID for secure URL
    const encryptedClubId = clubId ? crypto.encryptUrlSafe(clubId) : '';

    // Prepare template data
    const templateData = {
      userName: userName || 'Valued Member',
      clubName: clubName || 'Rotary Club',
      registrationId: registrationId || 'N/A',
      reviewDate: reviewDate || new Date().toLocaleDateString(),
      amount: amount || '0.00',
      remarks: remarks || 'Please review your submission and provide the correct documentation.',
      uploadUrl: uploadUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/upload-payment?token=${encryptedClubId}`,
      supportEmail: process.env.SUPPORT_EMAIL || 'support@rotaryclub.com',
      supportPhone: process.env.SUPPORT_PHONE || '+1 (555) 123-4567',
      year: new Date().getFullYear(),
    };

    // Replace template variables
    const htmlContent = replaceTemplateVariables(htmlTemplate, templateData);

    // Email configuration
    const msg = {
      to: to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@rotaryclub.com',
        name: process.env.SENDGRID_FROM_NAME || 'Rotary Club',
      },
      subject: `Registration Update Required - ${clubName}`,
      html: htmlContent,
    };

    // Send email
    const response = await sgMail.send(msg);

    return {
      success: true,
      messageId: response[0].headers['x-message-id'],
    };
  } catch (error) {
    console.error('SendGrid Error:', error);

    if (error.response) {
      console.error('SendGrid Response Error:', error.response.body);
    }

    throw new Error(`Failed to send rejection email: ${error.message}`);
  }
};

/**
 * Send payment proof re-upload confirmation email
 * @param {Object} params - Email parameters
 * @param {string} params.to - Recipient email address
 * @param {string} params.userName - User's name
 * @param {string} params.clubName - Club name
 * @param {string} params.registrationId - Transaction/Registration ID
 * @param {string} params.reuploadDate - Date of re-upload
 * @param {string} params.amount - Amount
 */
export const sendReuploadPendingEmail = async ({
  to,
  userName,
  clubName,
  registrationId,
  reuploadDate,
  amount,
}) => {
  try {
    // Read the HTML template
    const templatePath = path.join(__dirname, '../templates/emails/reupload-pending.html');
    const htmlTemplate = await fs.readFile(templatePath, 'utf-8');

    // Prepare template data
    const templateData = {
      userName: userName || 'Valued Member',
      clubName: clubName || 'Rotary Club',
      registrationId: registrationId || 'N/A',
      reuploadDate: reuploadDate || new Date().toLocaleDateString(),
      amount: amount || '0.00',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@rotaryclub.com',
      supportPhone: process.env.SUPPORT_PHONE || '+1 (555) 123-4567',
      year: new Date().getFullYear(),
    };

    // Replace template variables
    const htmlContent = replaceTemplateVariables(htmlTemplate, templateData);

    // Email configuration
    const msg = {
      to: to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@rotaryclub.com',
        name: process.env.SENDGRID_FROM_NAME || 'Rotary Club',
      },
      subject: `Payment Proof Re-uploaded - ${clubName}`,
      html: htmlContent,
    };

    // Send email
    const response = await sgMail.send(msg);

    return {
      success: true,
      messageId: response[0].headers['x-message-id'],
    };
  } catch (error) {
    console.error('SendGrid Error:', error);

    if (error.response) {
      console.error('SendGrid Response Error:', error.response.body);
    }

    throw new Error(`Failed to send reupload pending email: ${error.message}`);
  }
};

/**
 * Send visitor registration confirmation email with QR code attachment
 * @param {Object} params - Email parameters
 * @param {string} params.to - Recipient email address
 * @param {string} params.fullName - Attendee's full name
 * @param {string} params.email - Attendee's email
 * @param {string} params.clubName - Club name
 * @param {string} params.companyName - Company name
 * @param {string} params.designation - Job designation
 * @param {string} params.attendeeId - Unique attendee ID
 * @param {string} params.qrCodeBase64 - QR code as base64 data URL
 * @param {string} params.eventName - Event name
 * @param {string} params.registrationDate - Date of registration
 */
export const sendVisitorConfirmationEmail = async ({
  to,
  fullName,
  email,
  clubName,
  companyName,
  designation,
  attendeeId,
  qrCodeBase64,
  eventName,
  registrationDate,
}) => {
  try {
    // Read the HTML template
    const templatePath = path.join(__dirname, '../templates/emails/visitor-confirmation.html');

    const htmlTemplate = await fs.readFile(templatePath, 'utf-8');
    const content = {
      fullname: fullName.toUpperCase(),
      registerAs:"Visitor",
      qrcode: qrCodeBase64,
    };
    const canvas = await draw(content);
    const dataURL = canvas.toDataURL();
    // Prepare template data
    const templateData = {
      fullName: fullName || 'Valued Attendee',
      email: email || 'N/A',
      clubName: clubName || 'N/A',
      companyName: companyName || 'N/A',
      designation: designation || 'N/A',
      attendeeId: attendeeId || 'N/A',
      eventName: eventName || 'Rotary Event',
      registrationDate: registrationDate || new Date().toLocaleDateString(),
      qrCodeImage: dataURL, // Base64 data URL for inline display
      supportEmail: process.env.SUPPORT_EMAIL || 'support@rotaryclub.com',
      supportPhone: process.env.SUPPORT_PHONE || '+1 (555) 123-4567',
      year: new Date().getFullYear(),
    };

    // Replace template variables
    const htmlContent = replaceTemplateVariables(htmlTemplate, templateData);

    // Email configuration with attachment
    const msg = {
      to: to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@rotaryclub.com',
        name: process.env.SENDGRID_FROM_NAME || 'Rotary Club',
      },
      subject: `Registration Confirmed - ${eventName}`,
      html: htmlContent,
      attachments: [
        {
          content: dataURL.replace(/^data:image\/(png|jpg|jpeg);base64,/, ""),
          filename: `qrcode-${fullName}.png`,
          type: 'image/png',
          disposition: 'attachment',
          content_id: 'qrcode',
        },
        {
          content: qrCodeBase64.replace(/^data:image\/(png|jpg|jpeg);base64,/, ""),
          filename: `qrcode-${fullName}.png`,
          type: 'image/png',
          disposition: 'inline',
          content_id: 'qr',
        },
      ],
    };

    // Send email
    const response = await sgMail.send(msg);

    return {
      success: true,
      messageId: response[0].headers['x-message-id'],
    };
  } catch (error) {
    console.error('SendGrid Error:', error);

    if (error.response) {
      console.error('SendGrid Response Error:', error.response.body);
    }

    throw new Error(`Failed to send visitor confirmation email: ${error.message}`);
  }
};

export default {
  sendPendingRegistrationEmail,
  sendTransactionApprovedEmail,
  sendTransactionRejectedEmail,
  sendReuploadPendingEmail,
  sendVisitorConfirmationEmail,
  sendEmail,
};