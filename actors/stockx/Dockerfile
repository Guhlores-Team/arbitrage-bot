FROM apify/actor-node-playwright-chrome:20
COPY package.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund \
 && echo "Installed:" && (npm ls || true)
COPY . ./
CMD ["npm", "start"]
