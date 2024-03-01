const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const { Readable } = require('stream-browserify');

require('dotenv').config();

//const fs = require('node:fs/promises');
const fs = require('fs');

const app = express();
const appConfig = {
  port: process.env.APP_PORT,
  db_url: process.env.DB_URL
};

const port = appConfig.port;
const db_url = appConfig.db_url;

// Use the cors middleware to enable CORS
// app.use(cors({
//   origin: 'http://localhost:3000',
// }));

// Enable CORS for all routes
app.use(cors());

const upload_loc = './audio_files/'

const bodyParser = require('body-parser');
app.use(bodyParser.json());

app.use(express.json());

// Set up Multer to handle file uploads
const storage = multer.diskStorage({
  destination: upload_loc,
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

// Serve the React app
app.use(express.static(path.join(__dirname, 'speech_therapy/build')));

// init mongodb 

const mongoose = require("mongoose");

// Connect to MongoDB
mongoose.connect(db_url);
mongoose.pluralize(null);

// Define schema for audio files
const audioSchema = new mongoose.Schema({
  src: String,
  word: String,
  audio: Buffer
});

const testSchema = new mongoose.Schema({
  name: String,
  ids: [String]
});

const Audio = mongoose.model('audio_clips', audioSchema);

const TestData = mongoose.model('test_metadata', testSchema);

function removeTempFile(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error(`Error deleting file: ${err}`);
    } else {
      console.log(filePath + ` deleted successfully: ${fileNameWOext}.wav`);
    }
  });
}

async function saveTestDataToDB(testName, testIds) {

  return new Promise(async (resolve, reject) => {

    try {

      // Create a new audio document
      const testData = new TestData({
        name: testName,
        ids: testIds
      });

      // Save the audio document to MongoDB
      await testData.save();
      console.log('Test data saved to MongoDB');
      resolve();

    } catch (error) {

      console.error('Error saving test data to MongoDB:', error);
      reject();

    }

  });

}

// delete later
async function getTestData(audioIds) {
  try {
    console.log('getTestData >> start');
    // Find all documents in the collection
    const documents = await Audio.find({ _id: { $in: audioIds } }, { src: 1, word: 1, _id: 0 });

    console.log(documents);

    // Map documents to an array of objects containing field1 and field2
    const result = documents.map(({ src, word }) => ({ src, word }));

    return result;
  } catch (error) {
    console.error('Error retrieving documents:', error);
    throw error;
  }
}

async function getAllDocumentMetadata() {
  try {
    // Find all documents in the collection
    const documents = await Audio.find({}, { src: 1, word: 1, _id: 1 });

    console.log(documents);

    // Map documents to an array of objects containing field1 and field2
    const result = documents.map(({ src, word, id }) => ({ src, word, id }));

    return result;
  } catch (error) {
    console.error('Error retrieving documents:', error);
    throw error;
  }
}

async function getTestList() {
  try {
    // Find all documents in the collection
    const documents = await TestData.find({}, { name: 1, _id: 1 });

    console.log(documents);

    // Map documents to an array of objects containing field1 and field2
    const result = documents.map(({ name, id }) => ({ name, id }));

    return result;
  } catch (error) {
    console.error('Error retrieving test list:', error);
    throw error;
  }
}

app.get('/api/get/audio/:src', async (req, res, next) => {

  try {
    const audioName = req.params.src;
    // Find the audio document by name
    const audio = await Audio.findOne({ src: audioName });

    // If audio document not found, return 404
    if (!audio) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    // Set response headers
    res.set({
      'Content-Type': 'audio/mpeg', // Set appropriate content type for your audio file type
      'Content-Disposition': `attachment; filename="${audioName}"`, // Optional: Set download filename
    });

    // Create a readable stream from the audio buffer and pipe it to the response
    const audioStream = new Readable();
    audioStream.push(audio.audio);
    audioStream.push(null);
    audioStream.pipe(res);
  } catch (error) {
    console.error('Error streaming audio:', error);
    res.status(500).json({ error: 'Internal server error' });
  }

})

app.get('/api/get/testarray', async (req, res, next) => {

  res.header('Content-Type', 'application/json');

  try {

    const testId = req.query.testid;
    console.log(testId);
    const testObj = await TestData.findOne({ _id: testId });

    if (!testObj) {
      return res.status(404).json({ error: 'Test data not found' });
    } else {
      if (testObj.ids.length > 0) {
        getTestData(testObj.ids)
          .then((result) => {
            if (result) {
              console.log('Result:', result);
              res.json(result);
            }
            else {
              console.log('empty result');
              res.json([]);
            }

          })
          .catch((error) => {
            console.error('Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
          });
      }
      else {
        console.log('empty result');
        res.json([]);
      }
    }
  } catch (error) {
    console.error('Error fetching test data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }

})

app.get('/api/get/allwords', async (req, res) => {

  res.header('Content-Type', 'application/json');

  getAllDocumentMetadata()
    .then((result) => {
      if (result) {
        console.log('All audio meta data:', result);
        res.json(result);
      }
      else {
        console.log('empty result');
        res.json([]);
      }

    })
    .catch((error) => {
      console.error('Error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });

})

app.get('/api/get/testlist', async (req, res) => {

  res.header('Content-Type', 'application/json');

  getTestList()
    .then((result) => {
      if (result) {
        console.log('Test List:', result);
        res.json(result);
      }
      else {
        console.log('empty result');
        res.json([]);
      }

    })
    .catch((error) => {
      console.error('Error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });

})

// Handle file upload endpoint
app.post('/api/upload/audio', upload.single('file'), async (req, res) => {

  try {

    console.log(req)
    fileName = req.file.originalname
    word = req.body.word

    console.log(word);

    fileNameWOext = path.parse(fileName).name;

    console.log('.wav file uploaded: ' + fileNameWOext + '.wav');

    inputFilePath = upload_loc + fileNameWOext + '.wav';
    outputFilePath = upload_loc + fileNameWOext + '.mp3';
    outputFileName = fileNameWOext + '.mp3';

    saveAudioToDB(inputFilePath, outputFilePath, outputFileName, word)
      .then(() => {
        removeTempFile(inputFilePath);
        removeTempFile(outputFilePath);
        console.log('Conversion successful');
        res.status(200).send('File upload success');
      })
      .catch((error) => {
        console.error('error:', error);
        res.status(500).send('File upload unsuccess');
      })

  } catch (e) {
    res.status(500).send('File upload unsuccess');
  }

});

app.post('/api/upload/test', async (req, res) => {

  try {

    console.log('test data upload >> start');

    console.log(req.body);

    const data = req.body;

    saveTestDataToDB(data.name, data.ids);

    console.log('test data upload >> end');

  } catch (e) {
    res.status(500).send('Failed to save the test. Internal server error');
  }

});

// Catch-all route to serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'speech_therapy/build/index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
