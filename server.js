const puppeteer = require('puppeteer'); // Import Puppeteer


// Log the executable path that Puppeteer is using
console.log('Puppeteer Executable Path:', puppeteer.executablePath());

const mongoose = require('mongoose');
const cron = require('node-cron');
const express = require('express');
const app = express();

const PORT = 3000;  // Use the port provided by Render, or fallback to 3000 for local development

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const Schema = mongoose.Schema;
const examSchema = new Schema({
  examName: String,
  patternName: String,
  patternId: String,
  status: { type: Boolean, default: true }
});

const Exam = mongoose.model('Exam', examSchema);

const mongoDBUrl = 'mongodb+srv://abhaytagad:omshiv%4007@cluster0.6yuup.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(mongoDBUrl, { 
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Error connecting to MongoDB:', err));

async function scrapeWebsite() {
  // Launch Puppeteer browser with environment-based configuration
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || ' C:\Users\omshi\.cache\puppeteer\chrome\win64-133.0.6943.53\chrome-win64\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  

  const page = await browser.newPage();

  await page.goto('https://onlineresults.unipune.ac.in/Result/Dashboard/Default', {
    waitUntil: 'load',
    timeout: 60000,
  });

  await page.waitForSelector('tr');

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

  try {
    for (const exam of examDetails) {
      const res = await Exam.findOne({ examName: exam.examName });

      if (res) {
        if (res.patternName !== exam.patternName || res.patternId !== exam.patternId) {
          await Exam.findByIdAndUpdate(res._id, {
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

  await browser.close();
}

// Schedule scraping job every 25 minutes
cron.schedule('*/25 * * * *', () => {
  console.log('Running scheduled scraping job (every 25 minutes)');
  scrapeWebsite().catch((err) => {
    console.error('Error during scheduled scraping:', err);
    mongoose.disconnect();
  });
});

// Run initial scraping immediately on start
scrapeWebsite().catch((err) => {
  console.error('Error during initial scraping:', err);
  mongoose.disconnect();
});
