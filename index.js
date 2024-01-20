const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors'); 
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = 5001;

// Use the cors middleware to enable CORS
app.use(cors({
    origin: 'http://localhost:3000',
}));

const upload_loc = '../speech_therapy/src/audio_clips'

const inputPath = path.join(upload_loc,'voice.wav');
const outputPath = path.join(upload_loc,'voice.mp3');

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

function convertWavToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .audioCodec('libmp3lame')
      .toFormat('mp3')
      .on('end', () => {
        console.log('Conversion finished');
        resolve();
      })
      .on('error', (err) => {
        console.error('Error:', err);
        reject(err);
      })
      .save(outputPath);
  });
}

// Handle file upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  console.log(req)
  console.log('File uploaded:', req.file);
  res.status(200).send('File uploaded successfully!');
  convertWavToMp3(inputPath, outputPath)
  .then(() => {
    console.log('Conversion successful');
  })
  .catch((error) => {
    console.error('Conversion failed:', error);
  });
});

// Catch-all route to serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'speech_therapy/build/index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
