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

const contractStatusDatabase = {};
// async function uploadToGoFile(pdfBase64, fileName) {
//   const formData = new FormData();
//   // formData.append('file', Buffer.from(pdfBase64, 'base64'), 'contract.pdf');
//   const buffer = Buffer.from(pdfBase64, 'base64');

//    // Append the file buffer to the FormData
//   formData.append('file', buffer, { filename: fileName, contentType: 'application/pdf' });

//   // Make the API call to GoFile.io
//   try {
//     // Make the API call to GoFile.io
//     const response = await fetch('https://api.gofile.io/v1/uploadFile', {
//       method: 'POST',
//       body: formData
//     });

//     // Log the status and the raw response body
//     const responseText = await response.text();  // Get the response as text (HTML or JSON)
//     console.log('API Response:', responseText);

//     // Check if the response is in JSON format
//     try {
//       const data = JSON.parse(responseText);
//       if (data.status === 'ok') {
//         return data.data.downloadPage;  // Return the download link for the file
//       } else {
//         throw new Error('Failed to upload file to GoFile.io');
//       }
//     } catch (jsonError) {
//       // If response isn't JSON, log it and throw an error
//       throw new Error(`Failed to parse GoFile.io response as JSON: ${jsonError.message}`);
//     }
//   } catch (error) {
//     console.error('Error during file upload:', error);
//     throw new Error('Failed to upload file to GoFile.io');
//   }
// }

// POST endpoint for sending email with attachment
app.post('/send-contract', async (req, res) => {
  const { artistEmail, labelEmail, pdfBase64, fileName, contractId } = req.body;
  //const { artistEmail, labelEmail, fileName, contractId } = req.body;

  if (!artistEmail || !labelEmail || !pdfBase64 || !fileName) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }


  try {
   // const goFileUrl = await uploadToGoFile(pdfBase64, fileName);  // Upload PDF and get URL

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
    contractDatabase[contractId] = fileName;

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

// GET endpoint to serve the contract file based on contractId
app.get('/get-contract-file', async (req, res) => {
  const { contractId } = req.query;  // Get contractId from query parameter

  console.log('Received contractId:', contractId);

  // Validate contractId and retrieve the fileName (stored during email sending)
  const fileName = contractDatabase[contractId];  

  if (!fileName) {
    console.error('Contract not found for contractId:', contractId);
    return res.status(404).send('Contract not found');
  }

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

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
