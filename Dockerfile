# Stage 1: Build Frontend
FROM node:18-alpine AS build-frontend

# Install Git
RUN apk add --no-cache git

# Set working directory
WORKDIR /app/frontend

# Clone the frontend repo from GitHub
RUN git clone https://github.com/aaanandan/FE-PhotoUpload .

# Install frontend dependencies
RUN npm install

# Build argument for frontend .env file path
ARG FRONTEND_ENV_PATH

# Copy the frontend .env file if provided
RUN if [ -n "$FRONTEND_ENV_PATH" ]; then \
        cp "$FRONTEND_ENV_PATH" .env; \
    fi

# Build the frontend
RUN npm run build


# Stage 2: Setup Backend and Serve Frontend
FROM node:18-alpine

# Install Git
RUN apk add --no-cache git

# Set working directory
WORKDIR /app/backend

# Build argument for backend .env file path
ARG BACKEND_ENV_PATH

# Build argument to decide whether to pull from GitHub or use local code
ARG USE_LOCAL=false

# If USE_LOCAL is true, use the local backend code; otherwise, pull from GitHub
RUN if [ "$USE_LOCAL" != "true" ]; then \
        git clone https://github.com/aaanandan/photoUpload .; \
    fi

# Copy local backend code if USE_LOCAL is true
COPY . .

# Install backend dependencies
RUN npm install

# Copy the backend .env file if provided
RUN if [ -n "$BACKEND_ENV_PATH" ]; then \
        cp "$BACKEND_ENV_PATH" .env; \
    fi

# Copy the frontend build folder from the previous stage
COPY --from=build-frontend /app/frontend/build ./public

# Declare the public and uploads folders as volumes
VOLUME ["/app/backend/public", "/app/backend/uploads"]

# Expose the desired port (e.g., 3000 for Express.js)
EXPOSE 3000

# Start the backend server
CMD ["npx", "nodemon", "--ignore", "uploads/**/*", "server.js"]
