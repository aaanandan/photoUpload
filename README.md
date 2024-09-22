docker volume create public-data
docker volume create uploads-data

#docker build -t photoupload .
docker build --build-arg USE_LOCAL=false --build-arg FRONTEND_ENV_PATH=/path/to/frontend/.env  --build-arg BACKEND_ENV_PATH=/path/to/backend/.env  -t photoupload .


docker run -p 3000:3000 -v public-data:/app/backend/public -v uploads-data:/app/backend/uploads photoupload
docker run -p 3000:3000 -v /path/on/host/public:/app/backend/public -v /path/on/host/uploads:/app/backend/uploads photoupload
