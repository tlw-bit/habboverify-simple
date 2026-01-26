FROM node:18-bullseye-slim

# canvas native dependencies
RUN apt-get update && apt-get install -y \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  pkg-config \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better cache)
COPY package*.json ./
RUN npm ci

# Copy app
COPY . .

CMD ["npm", "start"]
