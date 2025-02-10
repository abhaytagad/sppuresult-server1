const puppeteer = require('puppeteer'); // Import Puppeteer
const mongoose = require('mongoose');
const cron = require('node-cron');
const express = require('express');
const app = express();
const path = puppeteer.executablePath(); // Log Puppeteer executable path
const Schema = mongoose.Schema;

// MongoDB URL
const mongoDBUrl = 'mongodb+srv://abhaytagad:omshiv%4007@cluster0.6yuup.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// MongoDB connection
mongoose.connect(mongoDBUrl, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Error connecting to MongoDB:', err));

// Define Exam schema
const examSchema = new Schema({
  examName: String,
  patternName: String,
  patternId: String,
  status: { type: Boolean, default: true }
});

const Exam = mongoose.model('Exam', examSchema);

// Set port for Express app
const PORT = 3000; // Use the port provided by Render, or fallback to 3000 for local development
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Retry mechanism for scraping
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const scrapeWebsiteWithRetry = async (attempts = 3) => {
  for (let i = 0; i < attempts; i++) {
    try {
      await scrapeWebsite();
      break; // Exit loop if scraping is successful
    } catch (err) {
      console.error(`Attempt ${i + 1} failed, retrying...`, err);
      if (i === attempts - 1) {
        console.error('Failed to scrape website after multiple attempts.');
      }
      await delay(5000 * (i + 1)); // Exponential backoff (5, 10, 15 seconds)
    }
  }
};

// Scrape website data with retry on timeout
async function scrapeWebsite() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: '/opt/render/.cache/puppeteer/chrome/linux-133.0.6943.53/chrome-linux64/chrome' // Exact path to Chrome
  });

  const page = await browser.newPage();

  let retries = 3; // Set the number of retries in case of failure

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`Attempt ${attempt + 1}: Navigating to the website...`);
      await page.goto('https://onlineresults.unipune.ac.in/Result/Dashboard/Default', {
        waitUntil: 'load',
        timeout: 1200000000 // Set a 2-minute timeout for loading
      });

      await page.waitForSelector('tr'); // Wait for rows to load

      const examDetails = await page.evaluate(() => {
        const regex = /Enterdetails\('([^']+)','([^']+)'\)/;
        const rows = document.querySelectorAll('tr');
        const exams = [];

        rows.forEach((row) => {
          const examData = row.innerHTML;
          const match = examData.match(regex);

          if (match) {
            const patternName = match[1];
            const patternId = match[2];
            const examName = row.querySelector('td:nth-child(2)').innerText.trim();

            exams.push({ examName, patternName, patternId });
          }
        });

        return exams;
      });

      // Save or update exam details in MongoDB
      await updateExamsInDB(examDetails);
      break; // Exit the loop if successful

    } catch (err) {
      if (attempt === retries - 1) {
        console.error('All retries failed. Could not load the page.');
      } else {
        console.error(`Attempt ${attempt + 1} failed. Retrying in 5 seconds...`);
        await delay(5000); // Wait for 5 seconds before retrying
      }
    }
  }

  await browser.close();
}

// MongoDB logic to save or update exam details
const updateExamsInDB = async (examDetails) => {
  try {
    for (const exam of examDetails) {
      const existingExam = await Exam.findOne({ examName: exam.examName });

      if (existingExam) {
        if (existingExam.patternName !== exam.patternName || existingExam.patternId !== exam.patternId) {
          await Exam.findByIdAndUpdate(existingExam._id, {
            patternName: exam.patternName,
            patternId: exam.patternId,
            status: true
          });
          console.log(`Exam updated: ${exam.examName}`);
        }
      } else {
        const newExam = new Exam({
          examName: exam.examName,
          patternName: exam.patternName,
          patternId: exam.patternId,
          status: true
        });

        await newExam.save();
        console.log(`New exam saved: ${exam.examName}`);
      }
    }
  } catch (err) {
    console.error('Error saving data to MongoDB:', err);
  }
};

// Schedule scraping job every 25 minutes
cron.schedule('*/25 * * * *', () => {
  console.log('Running scheduled scraping job (every 25 minutes)');
  scrapeWebsiteWithRetry().catch((err) => {
    console.error('Error during scheduled scraping:', err);
  });
});

// Run initial scraping immediately on start
scrapeWebsiteWithRetry().catch((err) => {
  console.error('Error during initial scraping:', err);
});
