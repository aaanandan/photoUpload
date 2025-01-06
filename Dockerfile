# Use a single-stage Dockerfile to build and serve both frontend and backend
FROM node:18-alpine

# Install Git, Curl, msmtp for email and any other necessary tools
RUN apk add --no-cache git curl msmtp

# Switch to root user for package installation
USER root

# FRONTEND SECTION
# Set working directory for frontend
WORKDIR /app/frontend

# Clone the frontend repository
RUN git clone https://github.com/aaanandan/FE-PhotoUpload .

# Install frontend dependencies and build the frontend
RUN npm install
RUN npm run build

# BACKEND SECTION
# Set working directory for backend
WORKDIR /app/backend

# Build argument to decide whether to pull from GitHub or use local code
ARG USE_LOCAL=false

# Copy local backend code (only if USE_LOCAL is true)
COPY . /app/backend/
RUN echo "copied local backend code to /app/backend/"

# Install backend dependencies
RUN npm install

# Copy frontend build files to the backend's public directory
RUN mkdir -p /app/backend/public && cp -r /app/frontend/build/* /app/backend/public/

# Copy the backend .env file if provided
ARG BACKEND_ENV_PATH
RUN if [ -n "$BACKEND_ENV_PATH" ]; then \
        cp "$BACKEND_ENV_PATH" .env; \
    fi

# Expose the desired port (e.g., 3500)
EXPOSE 3500

# Health check on the app's port 3500
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=5 \
  CMD curl -f http://localhost:3500 || exit 1

# Start the backend server
CMD ["npx", "nodemon", "--ignore", "uploads/**/*", "server.js"]
