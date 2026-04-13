FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Create data directory and define environment variable
RUN mkdir -p /data
ENV DATA_DIR=/data
ENV PORT=3001

EXPOSE 3001
CMD ["npm", "start"]
