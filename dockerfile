FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
EXPOSE 4000
CMD ["npx", "nodemon", "main.js"]
