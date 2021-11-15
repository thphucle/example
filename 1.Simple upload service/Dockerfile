FROM node:12.18.4-alpine
RUN mkdir -p /app
RUN mkdir -p /upload
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --only=production
COPY src ./src
CMD [ "npm", "start" ]
