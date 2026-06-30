# Playwright base — eBay now serves a bot challenge to plain HTTP requests, so a
# real browser is required to reach the rendered sold-listing markup.
FROM apify/actor-node-playwright-chrome:20

COPY package.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund \
 && echo "Installed:" && (npm ls || true)

COPY . ./

CMD ["npm", "start"]
