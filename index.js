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

// Define schema for audio files
const audioSchema = new mongoose.Schema({
  src: String,
  word: String,
  audio: Buffer
});

const Audio = mongoose.model('test1', audioSchema);

function removeTempFile(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error(`Error deleting file: ${err}`);
    } else {
      console.log(filePath + ` deleted successfully: ${fileNameWOext}.wav`);
    }
  });
}

async function saveAudioToDB(inputWavFilePath, outputFilePath, outputFileName, word) {

  return new Promise((resolve,reject) => {
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
  });

}

async function getAllDocumentsFields() {
  try {
    // Find all documents in the collection
    const documents = await Audio.find({}, { src: 1, word: 1, _id: 0 }); 

    console.log(documents);

    // Map documents to an array of objects containing field1 and field2
    const result = documents.map(({ src, word }) => ({ src, word }));

    return result;
  } catch (error) {
    console.error('Error retrieving documents:', error);
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

app.get('/api/get/testarray', async (req, res) => {

  res.header('Content-Type', 'application/json');

  getAllDocumentsFields()
  .then((result) => {
    if(result){
      console.log('Result:', result);
      res.json(result);
    }
    else{
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
app.post('/api/upload', upload.single('file'), async (req, res) => {

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
      console.error('error:',error);
      res.status(500).send('File upload unsuccess');
    })

  } catch (e) {
    res.status(500).send('File upload unsuccess');
  }

});

// Catch-all route to serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'speech_therapy/build/index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
