docker volume create public-data

docker volume create uploads-data



docker build -t photoupload .

docker run -p 3000:3000 -v public-data:/app/backend/public -v uploads-data:/app/backend/uploads photoupload
docker run -p 3000:3000 -v /path/on/host/public:/app/backend/public -v /path/on/host/uploads:/app/backend/uploads photoupload
