# ---------- Build Stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# copy and install dependencies
COPY package*.json ./
RUN npm install

# copy source and build
COPY . .
RUN npm run build

# ---------- Production Stage ----------
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# expose nginx port
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
