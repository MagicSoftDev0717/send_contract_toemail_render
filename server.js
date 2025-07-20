// Required modules
const express = require('express');
const sgMail = require('@sendgrid/mail');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');  // Import node-fetch to make HTTP requests
const FormData = require('form-data');  // Ensure form-data package is installed

// Set up SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
// Create Express app
const app = express();
app.use(cors({ origin: 'https://www.correctthecontract.com' }));

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Increase the limit as needed

const contractDatabase = {};

async function uploadToGoFile(pdfBase64) {
  const formData = new FormData();
  formData.append('file', Buffer.from(pdfBase64, 'base64'), 'contract.pdf');

  // Make the API call to GoFile.io
  const response = await fetch('https://api.gofile.io/uploadFile', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  if (data.status === 'ok') {
    return data.data.downloadPage;  // Return the download link for the file
  } else {
    throw new Error('Failed to upload file to GoFile.io');
  }
}

// POST endpoint for sending email with attachment
app.post('/send-contract', async (req, res) => {
  const { artistEmail, labelEmail, pdfBase64, fileName, contractId } = req.body;
  //const { artistEmail, labelEmail, fileName, contractId } = req.body;

  if (!artistEmail || !labelEmail || !pdfBase64 || !fileName) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

    async function uploadToGoFile(pdfBase64) {
      const formData = new FormData();
      formData.append('file', Buffer.from(pdfBase64, 'base64'), 'contract.pdf');

      // Make the API call to GoFile.io
      const response = await fetch('https://api.gofile.io/uploadFile', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (data.status === 'ok') {
        return data.data.downloadPage;  // Return the download link for the file
      } else {
        throw new Error('Failed to upload file to GoFile.io');
      }
  }

  try {
    const goFileUrl = await uploadToGoFile(pdfBase64);  // Upload PDF and get URL

      // Store the contract URL in the contract database
    contractDatabase[contractId] = goFileUrl;

    const msg = {
      to: labelEmail,
      from: 'darrensdesign01@gmail.com',
      replyTo: artistEmail,
      subject: 'New Artist Contract for Review',
      html: `
        <p>Hello,</p>
        <p>You’ve received a contract proposal from <b>${artistEmail}</b>.</p>
        <p>Click here: <a href="https://www.correctthecontract.com/contract-response?${contractId}">www.correctthecontract.com/contract-response</a></p>
        <p>Please review the attached contract and respond accordingly.</p>
      `,
      attachments: [
        {
          content: pdfBase64,
          //content: goFileUrl,
          filename: fileName,
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
    };

  
    // Send email using SendGrid
    const response = await sgMail.send(msg);
    return res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

app.get('/contract-response/:contractId', async (req, res) => {
  const { contractId } = req.params;
  
  // Validate contractId and retrieve the contract information
  const contractUrl = contractDatabase[contractId];  // This is where you map contractId to GoFile.io URL
  
  if (!contractUrl) {
    return res.status(404).send('Contract not found');
  }

  // Return the contract URL to the frontend
  res.json({ fileUrl: contractUrl });
});


// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
