// Required modules
const express = require('express');
const sgMail = require('@sendgrid/mail');
const bodyParser = require('body-parser');
const cors = require('cors');

// Set up SendGrid API key
sgMail.setApiKey('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');

// Create Express app
const app = express();
app.use(cors({ origin: 'https://www.correctthecontract.com' }));

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Increase the limit as needed

// POST endpoint for sending email with attachment
app.post('/send-contract', async (req, res) => {
  const { artistEmail, labelEmail, pdfBase64, fileName } = req.body;

  if (!artistEmail || !labelEmail || !pdfBase64 || !fileName) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const msg = {
    to: labelEmail,
    from: 'darrensdesign01@gmail.com',
    replyTo: artistEmail,
    subject: 'New Artist Contract for Review',
    html: `
      <p>Hello,</p>
      <p>You’ve received a contract proposal from <b>${artistEmail}</b>.</p>
      <p>Please review the attached contract and respond accordingly.</p>
    `,
    attachments: [
      {
        content: pdfBase64,
        filename: fileName,
        type: 'application/pdf',
        disposition: 'attachment',
      },
    ],
  };

  try {
    // Send email using SendGrid
    const response = await sgMail.send(msg);
    return res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
