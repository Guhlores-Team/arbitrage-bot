# Lightweight Node base — eBay results are server-rendered HTML, so we fetch over
# HTTP (CheerioCrawler) with browser-like headers. No browser = far cheaper/faster.
FROM apify/actor-node:20

COPY package.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund \
 && echo "Installed:" && (npm ls || true)

COPY . ./

CMD ["npm", "start"]
