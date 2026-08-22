const nodemailer = require("nodemailer");
const smtpPort = Number(process.env.SMTP_PORT || 465);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
// Sends the desktop Pro Max license key to the customer after a Razorpay
// invoice.paid webhook activates their license. The desktop app itself never
// takes a raw key - the customer sets a password via the "claim account"
// link below, then logs into the app with email+password, which activates
// and locks the license to that one device on the backend.
async function sendLicenseEmail({ to, licenseKey }) {
  const claimUrl = `https://ecomlens.jynzi.com/app/claim.html?email=${encodeURIComponent(to)}`;
  const downloadUrl = `https://ecomlens.jynzi.com/downloads/EcomLens%20Setup%202.0.0.exe`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2b2b; line-height: 1.6;">
      <h2 style="margin-bottom: 4px;">Your EcomLens Pro Max license is ready</h2>
      <p>Thanks for your purchase! Here's your license reference key (keep this for your records):</p>
      <p style="font-size: 20px; font-weight: 700; letter-spacing: 1px; background: #f5f5f5; padding: 12px 16px; border-radius: 8px; text-align: center;">${licenseKey}</p>
      <p><strong>Next steps:</strong></p>
      <ol>
        <li>Set your account password here: <a href="${claimUrl}">${claimUrl}</a></li>
        <li>Download and install the <a href="${downloadUrl}">EcomLens desktop app</a>.</li>
        <li>Open the app and log in with this email and the password you just set. Your license activates automatically on that device.</li>
      </ol>
      <p style="color: #6b6b6b; font-size: 13px;">For security, each license can only be active on one device at a time.</p>
      <p style="color: #6b6b6b; font-size: 13px; margin-top: 32px;">If you didn't make this purchase, please contact support@jynzi.com.</p>
    </div>
  `;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"EcomLens" <${process.env.SMTP_USER}>`,
    to,
    subject: "Your EcomLens Pro Max License Key",
    html,
  });
}
module.exports = { sendLicenseEmail };
