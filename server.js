// Required modules
const express = require('express');
const sgMail = require('@sendgrid/mail');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
//const fetch = require('node-fetch');  // Import node-fetch to make HTTP requests
const FormData = require('form-data');  // Ensure form-data package is installed
// const { fetch } = require('undici');
const fetch = require('undici').fetch;
const PDFLib = require('pdf-lib'); // Make sure to install this using npm install pdf-lib
const { PDFDocument } = require('pdf-lib');

// Set up SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
// Create Express app
const app = express();
app.use(cors({ origin: 'https://www.correctthecontract.com' }));

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Increase the limit as needed

const contractDatabase = {};


// POST endpoint for sending email with attachment

app.post('/send-contract-to-label', async (req, res) => {
  const { artistName, artistStreet, artistState, artistCountry, artistZip, artistEmail, labelEmail, pdfBase64, fileName, contractId } = req.body;

  if (!artistEmail || !labelEmail || !pdfBase64 || !fileName) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {

    const contractsDirectory = path.join(__dirname, 'contracts');

    if (!fs.existsSync(contractsDirectory)) {
      fs.mkdirSync(contractsDirectory, { recursive: true });  // Create directory if it doesn't exist
    }
  
     // Generate the file path for saving the contract
    const filePath = path.join(contractsDirectory, fileName);

    // Convert the base64 PDF into a buffer and save it as a file
    const buffer = Buffer.from(pdfBase64, 'base64');
    fs.writeFileSync(filePath, buffer);

    // Store the contract URL in the contract database
    contractDatabase[contractId] = { fileName, artistName, artistStreet, artistState, artistCountry, artistZip, artistEmail };

    const msg = {
      to: labelEmail,
      from: 'darrensdesign01@gmail.com',
      replyTo: artistEmail,
      subject: 'New Artist Contract for Review',
      html: `
        <p>Hello,</p>
        <p>You’ve received a contract proposal from <b>${artistEmail}</b>.</p>
        <p>Click here: <a href="https://www.correctthecontract.com/contract-response?contractId=${contractId}">www.correctthecontract.com/contract-response</a></p>
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

  
    // Send email using SendGrid
    const response = await sgMail.send(msg);
    return res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

// GET endpoint to serve the contract file based on contractId
app.get('/get-contract-file', async (req, res) => {
  const { contractId } = req.query;  // Get contractId from query parameter

  console.log('Received contractId:', contractId);

  // Validate contractId and retrieve the fileName (stored during email sending)
  const contract  = contractDatabase[contractId];  

  if (!contract ) {
    console.error('Contract not found for contractId:', contractId);
    return res.status(404).send('Contract not found');
  }

  const { fileName } = contract; // Now we directly get the fileName for this contract

  const downloadsFolder = path.join(__dirname, 'contracts');  // Get the Downloads directory
  const filePath = path.join(downloadsFolder, fileName);  // Use Downloads folder for storing


  if (!fs.existsSync(filePath)) {
    console.error('Contract file not found at path:', filePath);
    return res.status(404).send('Contract file not found');
  }

  // Serve the file to the frontend
  res.setHeader('Content-Type', 'application/pdf');
  res.download(filePath, fileName);  // Automatically trigger download
});


// Route for updating contract status
app.post('/update-contract-status', async (req, res) => {
  const { contractId, status } = req.body;

  // Find the contract file associated with the contractId
  const contractFileName = contractDatabase[contractId];
  if (!contractFileName) {
    return res.status(404).send('Contract not found');
  }

  // Load the contract PDF
  const contractFilePath  = path.join(__dirname, 'contracts', contractFileName);
  const existingPdfBytes = fs.readFileSync(contractFilePath );

  try {
    // Load the PDF file
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();

    // Log total number of pages to ensure the second page exists
    if (pages.length < 2) {
      return res.status(400).send('PDF must have at least 2 pages');
    }

    const secondPage = pages[1];  // Reference the second page (index 1)

    // Define positions dynamically based on selected status
    let positionX = 0;
    let positionY = 0;

    // Conditional statements for each status
    if (status === 'Accept') {
      positionX = 50;
      positionY = 680;  // Adjust this position based on where "Accept" should go
    } else if (status === 'Reject') {
      positionX = 100;
      positionY = 680;  // Adjust this position based on where "Reject" should go
    } else if (status === 'CounterOffer') {
      positionX = 150;
      positionY = 680;  // Adjust this position based on where "CounterOffer" should go
    } else {
      return res.status(400).send('Invalid status');
    }

    // Draw the checkmark next to the selected option on the second page
    secondPage.drawText(`• ${status}`, {
      x: positionX,
      y: positionY,
      size: 12,
      color: PDFDocument.rgb(0, 0, 0)
    });
    // Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();

    // Save the updated PDF in the same location
    fs.writeFileSync(contractFilePath, modifiedPdfBytes);

    // Return the modified PDF to the frontend (or a download URL)
    res.setHeader('Content-Type', 'application/pdf');
    res.send(modifiedPdfBytes);
  } catch (error) {
    console.error('Error updating contract status:', error);
    res.status(500).send('Error updating contract status');
  }
});



// POST endpoint to send contract back to the artist
app.post('/send-contract-to-artist', async (req, res) => {
  const { artistEmail, labelEmail, pdfBase64, fileName, contractId, fileUrl } = req.body;

  if (!artistEmail || !labelEmail || !pdfBase64 || !fileName) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    // Send the contract back to the artist
    const msg = {
      to: artistEmail,
      from: 'darrensdesign01@gmail.com',
      subject: 'Contract Signed by Label',
      html: `
        <p>Hello,</p>
        <p>The contract has been reviewed and signed by the label.</p>
        <p>You can download it here: <a href="${fileUrl}">${fileUrl}</a></p>
        <p>Best regards,</p>
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

    await sgMail.send(msg);
    return res.status(200).json({ message: 'Contract sent back to the artist successfully' });
  } catch (error) {
    console.error('Error sending email to artist:', error);
    return res.status(500).json({ error: 'Failed to send email to artist' });
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
