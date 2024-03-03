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
const { timeStamp } = require('console');

// Connect to MongoDB
mongoose.connect(db_url);
mongoose.pluralize(null);

const Schema = mongoose.Schema;

// Define schema for audio files
const audioSchema = new mongoose.Schema({
  src: String,
  word: String,
  audio: Buffer
});

const testSchema = new mongoose.Schema({
  name: String,
  ids: [Schema.Types.ObjectId]
});

const testResultSchema = new mongoose.Schema({
  testId: Schema.Types.ObjectId,
  correct: Number,
  total: Number
}, { timestamps: true });

const Audio = mongoose.model('audio_clips', audioSchema);

const TestData = mongoose.model('test_metadata', testSchema);

const TestResult = mongoose.model('test_results', testResultSchema);

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

async function saveAudioToDB(inputWavFilePath, outputFilePath, outputFileName, word) {

  return new Promise((resolve, reject) => {
    // Create a writable stream to store the converted audio data
    const outputStream = fs.createWriteStream(outputFilePath);

    // Create ffmpeg command
    const command = ffmpeg()
      .input(inputWavFilePath)
      .audioCodec('libmp3lame') // specify audio codec (MP3)
      .format('mp3'); // specify output format

    // Write the converted audio data to the output stream
    command.pipe(outputStream);

    // Handle ffmpeg events
    command.on('start', () => {
      console.log('ffmpeg processing started');
    }).on('progress', (progress) => {
      console.log(`Processing: ${progress.percent}% done`);
    }).on('end', async () => {

      console.log('conversion finished');

      // Read the converted audio file
      const convertedAudioBuffer = fs.readFileSync(outputFilePath);

      try {
        // Create a new audio document
        const audio = new Audio({
          src: outputFileName,
          word: word,
          audio: convertedAudioBuffer,
        });

        // Save the audio document to MongoDB
        await audio.save();
        console.log('Converted audio file saved to MongoDB');
        resolve();
      } catch (error) {
        console.error('Error saving converted audio file to MongoDB:', error);
      }
    }).on('error', (err) => {
      console.error('Error during processing:', err);
      rejects(error);
    });
  })
}

async function saveTestResultToDB(testId, correct, total) {

  return new Promise(async (resolve, reject) => {

    try {

      // Create a new audio document
      const testResult = new TestResult({
        testId: testId,
        correct: correct,
        total: total
      });

      // Save the audio document to MongoDB
      await testResult.save();
      console.log('Test results saved to MongoDB');
      resolve();

    } catch (error) {

      console.error('Error saving test results to MongoDB:', error);
      reject();

    }

  });

}

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

async function getResultsGrid() {

  try {
    const gridData = await TestResult.aggregate([
      {
        $group: {
          _id: '$testId',
          totalAttempts: { $sum: 1 },
          totalQuestions: { $sum: '$total' },
          totalCorrect: { $sum: '$correct' }
        }
      },
      {
        $lookup: {
          from: 'test_metadata', // Name of the collection to join
          localField: '_id', // Field from the input document
          foreignField: '_id', // Field from the 'test_metadat' collection
          as: 'test_lookup' // Output array field
        }
      },
      {
        $unwind: '$test_lookup'
      },
      {
        $project: {
          id: '$_id',
          attemptCount: { $sum: '$totalAttempts' },
          successRate: { $divide: ['$totalCorrect', '$totalQuestions'] },
          testName: '$test_lookup.name'
        }
      },

    ]);

    return gridData;
  }

  catch (error) {
    console.error('Error retrieving result grid:', error);
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

    // console.log(req)
    fileName = req.file.originalname
    word = req.body.word

    console.log('uploading word: ' + word);

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

    // check if duplicates exist
    try {
      const existingEntry = await TestData.findOne({ name: data.name });
      if (existingEntry) {
        console.log('Duplicate entry found!');
        res.status(422).send('Test with same name exist');
        return;
      }
      console.log('No duplicate entry found.');
    } catch (error) {
      console.error('Error checking for duplicate entry:', error);
      throw error;
    }

    saveTestDataToDB(data.name, data.ids);

    console.log('test data upload >> end');

  } catch (e) {
    res.status(500).send('Failed to save the test. Internal server error');
  }

});

app.post('/api/upload/testresult', async (req, res) => {

  try {

    console.log('test result upload >> start');

    const data = req.body;

    saveTestResultToDB(data.testId, data.correct, data.total);

    console.log('test results upload >> end');

  } catch (e) {
    res.status(500).send('Failed to save the test results. Internal server error');
  }

});

app.delete('/api/delete/audio', async (req, res, next) => {

  res.header('Content-Type', 'application/json');

  try {

    const audioId = req.query.audioid;
    //console.log(testId);
    const audioObj = await Audio.findOne({ _id: audioId });

    // Find and delete document with specific ID
    await Audio.findOneAndDelete({ _id: audioId })
      .then((result) => {
        if (result) {
          console.log('Audio file deleted successfully:', result);
        } else {
          console.log('Audio file not found');
        }
      })
      .catch((error) => {
        console.error('Error deleting audio file:', error);
        // Close the MongoDB connection
        throw error;
      });

    // Update all documents to remove string audioId from the ids field
    // Pull all removes every occurance of audioId

    await TestData.updateMany({}, { $pullAll: { ids: [audioId] } })
      .then((result) => {
        if (result) {
          console.log('Audio IDs removed successfully from tests:', result);
        } else {
          console.log('Audio IDs cannot be found in tests');
        }
      })
      .catch((error) => {
        console.error('Error in removing audio IDs from tests:', error);
      });


  } catch (error) {
    console.error('Error fetching test data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }

})

app.get('/api/get/results/grid', async (req, res) => {

  res.header('Content-Type', 'application/json');

  getResultsGrid()
    .then((result) => {
      if (result) {
        console.log('Results grid:', result);
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

// Catch-all route to serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'speech_therapy/build/index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
