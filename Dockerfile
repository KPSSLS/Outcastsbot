FROM node:20-alpine AS base

WORKDIR /app

COPY package.json ./

RUN npm i

COPY . /app

FROM base

WORKDIR /app

COPY --from=base /app /app

CMD ["npm", "run", "start"]