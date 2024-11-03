docker volume create public-data
docker volume create uploads-data

#build iamge  #docker build -t photoupload .

docker build --build-arg USE_LOCAL=false --build-arg FRONTEND_ENV_PATH=/path/to/frontend/.env  --build-arg BACKEND_ENV_PATH=/path/to/backend/.env  -t photoupload .

#run Iamge with voume(1) or with local folders(2)

docker run -p 3000:3000 -v public-data:/app/backend/public -v uploads-data:/app/backend/uploads photoupload

docker run -p 3000:3000 -v /path/on/host/public:/app/backend/public -v /path/on/host/uploads:/app/backend/uploads photoupload

#remove container and images LINUX
docker ps -q --filter "ancestor=photoupload" | xargs -r docker stop && \
docker ps -aq --filter "ancestor=photoupload" | xargs -r docker rm && \
docker images photoupload-q | xargs -r docker rmi

#remove container and images WINDOWS
for /f "tokens=*" %i in ('docker ps -q --filter "ancestor=photoupload"') do docker stop %i
for /f "tokens=*" %i in ('docker ps -aq --filter "ancestor=photoupload"') do docker rm %i
for /f "tokens=*" %i in ('docker images -q photoupload-q') do docker rmi %i
