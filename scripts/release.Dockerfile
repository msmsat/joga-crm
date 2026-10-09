FROM node:24-bookworm-slim AS node
FROM python:3.14-slim-bookworm

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
WORKDIR /release
COPY back/requirements.txt back/requirements-dev.txt /requirements/
RUN pip install --no-cache-dir -r /requirements/requirements.txt -r /requirements/requirements-dev.txt
COPY miniapp/package.json miniapp/package-lock.json /release/miniapp/
RUN cd miniapp && npm ci && npx playwright install --with-deps chromium
COPY back /release/back
COPY miniapp /release/miniapp
COPY scripts /release/scripts
ENV CI=true MINIAPP_E2E_PYTHON=/usr/local/bin/python MINIAPP_RELEASE_EVIDENCE=/evidence
WORKDIR /release/miniapp
CMD ["npm", "run", "verify"]
