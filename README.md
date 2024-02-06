To start the server run

rename config.json.template to config.json

node index.js


# For Docker

## Dev

docker build -t speech_therapy_server:v0.9 -f Dockerfile.dev .
docker run --name speech_therapy_server -p 5001:5001 speech_therapy_server:v0.9

## Production

docker build -t speech_therapy_server:v1 -f Dockerfile.production .
docker run --name speech_therapy_server -p 5001:5001 -v ./config.json:/app/config.json -v ./audio_files:/app/audio_files --env-file .env speech_therapy_server:v1




