// Required modules
const express = require('express');
const sgMail = require('@sendgrid/mail');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
//const fetch = require('node-fetch');  // Import node-fetch to make HTTP requests
const FormData = require('form-data');  // Ensure form-data package is installed
const { fetch } = require('undici');
// Set up SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
// Create Express app
const app = express();
app.use(cors({ origin: 'https://www.correctthecontract.com' }));

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Increase the limit as needed

const contractDatabase = {};

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
  const { artistEmail, labelEmail, pdfBase64, fileName, contractId, fileUrl } = req.body;
  //const { artistEmail, labelEmail, fileName, contractId } = req.body;

  if (!artistEmail || !labelEmail || !pdfBase64 || !fileName) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }


  try {
   // const goFileUrl = await uploadToGoFile(pdfBase64, fileName);  // Upload PDF and get URL

      // Store the contract URL in the contract database
    contractDatabase[contractId] = fileUrl;

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

app.get('/contract-response', async (req, res) => {
  const { contractId } = req.query;
  console.log("Received contractId:", contractId);  // Log the contractId
  // Validate contractId and retrieve the contract information
  const contractUrl = contractDatabase[contractId];  // This is where you map contractId to GoFile.io URL
  
  if (!contractUrl) {
    return res.status(404).send('Contract not found');
  }

  // Return the contract URL to the frontend
  res.json({ fileUrl: contractUrl });
});

// Proxy endpoint to fetch the file from GoFile.io and return it to the frontend
app.get('/proxy-gofile', async (req, res) => {
  const { fileUrl } = req.query;  // Get the GoFile URL passed as a query parameter
  console.log('Received fileUrl:', fileUrl);  // Log the file URL to verify
  if (!fileUrl) {
     return res.status(400).send('File URL is missing');
  }

   // GoFile.io API URL for getting the direct download link
  const apiUrl = `https://api.gofile.io/getUploadLink?fileId=${fileUrl.split('/').pop()}`;

  try {
    // Fetch the PDF file from GoFile.io
    const apiResponse = await fetch(apiUrl);
    const apiData = await apiResponse.json();

    if (apiData.status !== 'ok' || !apiData.data || !apiData.data.downloadUrl) {
      console.error('Failed to retrieve the file download link from GoFile.io');
      return res.status(500).send('Failed to retrieve the file from GoFile.io');
    }

     // Get the direct download URL from the API response
    const directDownloadUrl = apiData.data.downloadUrl;
    console.log('Direct download URL:', directDownloadUrl);

    // Fetch the actual PDF file using the direct download URL
    const fileResponse = await fetch(directDownloadUrl);

    if (!fileResponse.ok) {
      console.error('Failed to fetch the PDF file', fileResponse.statusText);
      return res.status(500).send('Failed to fetch the PDF file');
    }

    const contentType = fileResponse.headers.get('content-type');
    console.log('Response content type:', contentType);

    if (!contentType || !contentType.includes('application/pdf')) {
      console.error('The file returned is not a PDF');
      return res.status(500).send('The file returned is not a PDF');
    }

    // Convert the response to a buffer
    const fileBuffer = await fileResponse.arrayBuffer();

    if (fileBuffer.byteLength === 0) {
      return res.status(500).send('Received an empty file');
    }

    // Return the file as a response to the frontend
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from(fileBuffer));

  } catch (error) {
    console.error('Error fetching file from GoFile.io:', error);
    return res.status(500).send('Error fetching file from GoFile.io');
  }
});


// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
