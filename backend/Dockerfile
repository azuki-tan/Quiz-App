FROM node:20-alpine

# sqlite3 needs build tools for native bindings
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

RUN npm install --production=false

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/server.js"]
