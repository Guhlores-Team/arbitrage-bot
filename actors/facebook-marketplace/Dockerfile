# Apify base image with Node + Playwright + Chromium preinstalled.
FROM apify/actor-node-playwright-chrome:20

# Install deps (Playwright/Chromium already provided by the base image).
COPY package.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund \
 && echo "Installed:" && (npm ls || true)

COPY . ./

CMD ["npm", "start"]
