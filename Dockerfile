# Stage 1: Build Frontend
FROM node:18-alpine AS build-frontend

# Install Git
RUN apk add --no-cache git

# Set working directory
WORKDIR /app/frontend

# Clone the frontend repo
RUN git clone https://github.com/aaanandan/FE-PhotoUpload .

# Install frontend dependencies
RUN npm install

# Build the frontend
RUN npm run build

# Stage 2: Setup Backend and Serve Frontend
FROM node:18-alpine

# Install Git
RUN apk add --no-cache git

# Set working directory
WORKDIR /app/backend

# Clone the backend repo
RUN git clone https://github.com/aaanandan/photoUpload .

# Install backend dependencies
RUN npm install

# Copy the frontend build folder from the previous stage
COPY --from=build-frontend /app/frontend/build ./public

# Expose the desired port (e.g., 3000 for Express.js)
EXPOSE 3000

# Start the backend server
CMD ["npx", "nodemon", "server.js"]
