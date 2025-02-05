const puppeteer = require('puppeteer-core'); // Using puppeteer-core to manually specify Chromium path
const mongoose = require('mongoose');
const cron = require('node-cron');
const path = require('path');

const Schema = mongoose.Schema;
const examSchema = new Schema({
  examName: String,
  patternName: String,
  patternId: String,
  status: { type: Boolean, default: true }
});

const Exam = mongoose.model('Exam', examSchema);

// MongoDB connection string
const mongoDBUrl = 'mongodb+srv://abhaytagad:omshiv%4007@cluster0.6yuup.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(mongoDBUrl, { 
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Error connecting to MongoDB:', err));

async function scrapeWebsite() {
  // Launch Puppeteer with the correct Chromium path for Render or your environment
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  

  const page = await browser.newPage();

  try {
    // Load the webpage
    await page.goto('https://onlineresults.unipune.ac.in/Result/Dashboard/Default', {
      waitUntil: 'load',
      timeout: 60000,
    });

    // Wait for the required table rows to load
    await page.waitForSelector('tr');

    // Scrape data from the page
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

    // Save or update scraped data in MongoDB
    for (const exam of examDetails) {
      const res = await Exam.findOne({ examName: exam.examName });

      if (res) {
        // Update if the pattern data has changed
        if (res.patternName !== exam.patternName || res.patternId !== exam.patternId) {
          await Exam.findByIdAndUpdate(res._id, {
            patternName: exam.patternName,
            patternId: exam.patternId, 
            status: true
          });
          console.log(`Exam updated: ${exam.examName}`);
        } 
      } else {
        // Insert a new exam record
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
    console.error('Error scraping website:', err);
  } finally {
    await browser.close();
  }
}

// Schedule the scraping task every 25 minutes using cron
cron.schedule('*/25 * * * *', () => {
  console.log('Running scheduled scraping job (every 25 minutes)');
  scrapeWebsite().catch((err) => {
    console.error('Error during scheduled scraping:', err);
    mongoose.disconnect();
  });
});

// Run the initial scrape when the server starts
scrapeWebsite().catch((err) => {
  console.error('Error during initial scraping:', err);
  mongoose.disconnect();
});
