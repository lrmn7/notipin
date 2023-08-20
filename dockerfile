# Gunakan image node terbaru sebagai dasar
FROM node:18

# Set folder kerja di dalam container
WORKDIR /usr/src/app

# Salin package.json dan package-lock.json untuk menginstal dependensi
COPY package*.json ./

# Install dependensi
RUN npm install

# Salin seluruh konten proyek ke dalam container
COPY . .

# Jalankan bot
CMD [ "npm", "start" ]
