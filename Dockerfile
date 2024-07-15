# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Switch to root user
USER root

# Add contrib packages for ms fonts and required libs for Headless Chrome
RUN apt-get update && \
    apt-get install -yq gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
    libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
    libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget \
    fontconfig && \
    fc-cache -f && \
    apt-get install -y chromium && \
    ln -s /usr/bin/chromium /usr/bin/google-chrome && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Add a non-privileged user to run the application
RUN groupadd -r chrome && useradd --no-log-init -r -g chrome -G audio,video chrome && \
    mkdir -p /home/chrome && chown -R chrome:chrome /home/chrome

# Set the working directory
WORKDIR /usr/src/app

# Copy the package.json and package-lock.json
COPY package*.json ./

# Install dependencies including Puppeteer
RUN npm install

# Copy the rest of the application code
COPY . .

# Ensure all application files are owned by the non-privileged user
RUN chown -R chrome:chrome /usr/src/app

# Switch to the non-privileged user
USER chrome

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the app
CMD ["node", "server.js"]
