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
  const { artistName, artistStreet, artistCity, artistState, artistCountry, artistZip, artistEmail, labelName, labelStreet, labelCity, labelState, labelCountry, labelZip, labelEmail, pdfBase64, fileName, contractId } = req.body;

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
    contractDatabase[contractId] = { fileName, artistName, artistStreet, artistCity, artistState, artistCountry, artistZip, artistEmail, labelName, labelStreet, labelCity, labelState, labelCountry, labelZip, labelEmail };

    const msg = {
      to: labelEmail,
      from: 'darrensdesign01@gmail.com',
      replyTo: artistEmail,
      subject: 'New Artist Contract for Review',
      html: `
        <body>
          <p>Dear,${labelName}</p>
          <p>You’ve received a contract proposal from <b>${artistName} - ${artistEmail}.</p>
          <p>Click here: <a href="https://www.correctthecontract.com/contract-response?contractId=${contractId}">www.correctthecontract.com/contract-response</a></p>
          
        </body>
      `,
      // attachments: [
      //   {
      //     content: pdfBase64,
      //     filename: fileName,
      //     type: 'application/pdf',
      //     disposition: 'attachment',
      //   },
      // ],
    };

  
    // Send email using SendGrid
    const response = await sgMail.send(msg);
    return res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

// GET endpoint to serve the contract metadata (JSON)
app.get('/get-contract-file', async (req, res) => {
  const { contractId } = req.query; // Get contractId from query parameter

  console.log('Received contractId:', contractId);

  const contract = contractDatabase[contractId];

  if (!contract) {
    console.error('Contract not found for contractId:', contractId);
    return res.status(404).send('Contract not found');
  }

  // Return the contract data as JSON (metadata)
  res.json(contract);
});


// GET endpoint to serve the contract file (PDF)
app.get('/get-contract-pdf', async (req, res) => {
  const { contractId } = req.query;  // Get contractId from query parameter

  console.log('Received contractId:', contractId);

  const contract = contractDatabase[contractId];

  if (!contract) {
    console.error('Contract not found for contractId:', contractId);
    return res.status(404).send('Contract not found');
  }

  const filePath = path.join(__dirname, 'contracts', contract.fileName);

  if (!fs.existsSync(filePath)) {
    console.error('Contract file not found at path:', filePath);
    return res.status(404).send('Contract file not found');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.download(filePath);  // Serve the contract file
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



// POST endpoint for sending email with attachment

app.post('/send-contract-to-artist', async (req, res) => {
  
  const { artistName, labelName, artistEmail, labelEmail, pdfBase64, fileName, isContractApproved } = req.body;
  if (!artistEmail || !labelEmail || !pdfBase64 || !fileName || isContractApproved === undefined) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {

    // const contractsDirectory = path.join(__dirname, 'contracts');

    // if (!fs.existsSync(contractsDirectory)) {
    //   fs.mkdirSync(contractsDirectory, { recursive: true });  // Create directory if it doesn't exist
    // }
  
     // Generate the file path for saving the contract
    // const filePath = path.join(contractsDirectory, fileName);

    // Convert the base64 PDF into a buffer and save it as a file
    // const buffer = Buffer.from(pdfBase64, 'base64');
    // fs.writeFileSync(filePath, buffer);

    // Store the contract URL in the contract database
    // contractDatabase[contractId] = { fileName, artistName, artistStreet, artistState, artistCountry, artistZip, artistEmail, labelName, labelStreet, labelState, labelCountry, labelZip, labelEmail };

    // Create the message to send to the artist
    let emailSubject = '';
    let emailBody = '';

    if (isContractApproved) {
      emailSubject = 'Your Contract Has Been Approved!';
      emailBody = `
        <p>Hello, ${artistName}</p>
        <p>Good news! The label has approved your contract proposal.</p>
        <p>You’ve received a contract proposal from <b>${labelName} - ${labelEmail}</b>.</p>
        <p>You can now proceed with the next steps. Please find the contract details below and attached.</p>
      `;
    } else {
      emailSubject = 'Contract Proposal for Review';
      emailBody = `
        <p>Hello, ${artistName}</p>
        <p>You’ve received a contract proposal from <b>${labelName} - ${labelEmail}</b>.</p>
        <p>The label has reviewed your contract proposal and is now ready for your feedback.</p>
        <p>Please review the attached contract and respond accordingly.</p>
      `;
    }

    const msg = {
      to: artistEmail,
      from: 'darrensdesign01@gmail.com',
      replyTo: labelEmail,
      subject: emailSubject,
      html: emailBody,
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

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
