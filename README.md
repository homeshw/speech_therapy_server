To start the server run

node index.js


# For Docker

## Dev

docker build -t speech_therapy_server:v0.9 -f Dockerfile.dev .
docker run --name speech_therapy_server -p 5001:5001 speech_therapy_server:v0.9

## Production

docker build -t speech_therapy_server:v1 -f Dockerfile.production .
docker run --name speech_therapy_server -p 5001:5001 speech_therapy_server:v1




