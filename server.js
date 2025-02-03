const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const cron = require('node-cron');

// MongoDB Schema Setup
const Schema = mongoose.Schema;
const examSchema = new Schema({
    examName: String,
    patternName: String,
    patternId: String,
    status: { type: Boolean, default: true }
});

const Exam = mongoose.model('Exam', examSchema);

// MongoDB Connection URL
const mongoDBUrl = 'mongodb+srv://abhaytagad:omshiv%4007@cluster0.6yuup.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(mongoDBUrl, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Error connecting to MongoDB:', err));

async function scrapeWebsite() {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],  // Render-specific configuration
    });

    const page = await browser.newPage();
    await page.goto('https://onlineresults.unipune.ac.in/Result/Dashboard/Default', {
      waitUntil: 'load',
      timeout: 60000,
    });

    await page.waitForSelector('tr');  // Wait for table rows to load

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

    await browser.close();
  } catch (err) {
    console.error('Error during scraping:', err);
  }
}

// Schedule scraping every 25 minutes
cron.schedule('*/25 * * * *', () => {
  console.log('Running scheduled scraping job (every 25 minutes)');
  scrapeWebsite().catch((err) => {
    console.error('Error during scheduled scraping:', err);
    mongoose.disconnect();
  });
});
 
// Initial scrape on startup
scrapeWebsite().catch((err) => {
  console.error('Error during initial scraping:', err);
  mongoose.disconnect();
});
