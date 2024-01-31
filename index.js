const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

//const fs = require('node:fs/promises');
const fs = require('fs');

const app = express();
const port = 5001;

// Use the cors middleware to enable CORS
app.use(cors({
  origin: 'http://localhost:3000',
}));

const upload_loc = './audio_files/'
const confFilePath = 'config.json'

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

const updateConfig = (newObj) => {
  fs.readFile(confFilePath, 'utf8', (err, data) => {
    if (err) {
      fs.writeFile(confFilePath, JSON.stringify([newObj]), 'utf8', (writeErr) => {
        if (writeErr) {
          console.error(`Error writing file: ${writeErr}`);
        } else {
          console.log('File created with new data');
        }
      });
    } else {
      const existingData = JSON.parse(data);

      existingData.push(newObj);

      fs.writeFile(confFilePath, JSON.stringify(existingData), 'utf8', (writeErr) => {
        if (writeErr) {
          console.error(`Error writing file: ${writeErr}`);
        } else {
          console.log('Data appended to file')
        }

      });
    }
  })
};

app.get('/get/audio/:src', async (req, res, next) => {

  file_name = req.params.src;

  const filePath = upload_loc + file_name;

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  const headers = {
    'Content-Length': fileSize,
    'Content-Type': 'audio/mpeg',
  };

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);

})

app.get('/get/testarray', async (req, res) => {

  res.header('Content-Type', 'application/json');
  fs.readFile(confFilePath, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error reading file: ${err}`);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (parseError) {
        console.error(`Error parsing JSON: ${parseError}`);
        res.status(500).json({ error: 'Error parsing JSON' });
      }
    }
  })
  
})

// Handle file upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {

  //console.log(req)
  fileName = req.file.originalname
  word =  req.body.word

  console.log(word);

  fileNameWOext = path.parse(fileName).name;

  console.log('.wav file uploaded: ' + fileNameWOext + '.wav');

  inputPath = upload_loc + fileNameWOext + '.wav';
  outputPath = upload_loc + fileNameWOext + '.mp3';

  convertWavToMp3(inputPath, outputPath)
    .then(() => {
      console.log('Conversion successful');
      fs.unlink(inputPath, (err) => {
        if (err) {
          console.error(`Error deleting file: ${err}`);
        } else {
          console.log(`.wav file deleted successfully: ${fileNameWOext}.wav`);
        }
      });
      updateConfig({ src: `${fileNameWOext}.mp3`, word:  word});
    })
    .catch((error) => {
      console.error('Conversion failed:', error);
    });
  console.log('.mp3 file uploaded: ' + fileNameWOext + '.mp3');

  res.status(200).send('File upload success');
  
});

// Catch-all route to serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'speech_therapy/build/index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
